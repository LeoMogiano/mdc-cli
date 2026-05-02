import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import pLimit from "p-limit";
import { ContainerCandidate, ContainerAction, InternalComponent } from "../models/container.js";
import { Category, ExecutionKind, RiskLevel, Tool } from "../models/enums.js";
import { ProcessRunner } from "../services/processRunner.js";
import { SizeCalculator } from "../services/sizeCalculator.js";

const DEVICES_ROOT = path.join(
  os.homedir(),
  "Library/Developer/CoreSimulator/Devices",
);

interface SimctlDevice {
  udid: string;
  name: string;
  state: string;
  isAvailable: boolean;
  availabilityError?: string;
  runtime?: string;
  dataPath?: string;
}

interface SimctlListOutput {
  devices: Record<string, SimctlDevice[]>;
}

export class XcodeSimulatorsScanner {
  private limit = pLimit(8);

  constructor(
    private runner: ProcessRunner = new ProcessRunner(),
    private sizes: SizeCalculator = new SizeCalculator(),
  ) {}

  async scan(): Promise<ContainerCandidate[]> {
    const r = await this.runner.run(
      "/usr/bin/xcrun",
      ["simctl", "list", "devices", "--json"],
      { timeoutMs: 30_000 },
    );
    if (r.exitCode !== 0 || !r.stdout) return [];

    let parsed: SimctlListOutput;
    try {
      parsed = JSON.parse(r.stdout) as SimctlListOutput;
    } catch {
      return [];
    }

    const flat: { runtime: string; device: SimctlDevice }[] = [];
    for (const [runtime, devices] of Object.entries(parsed.devices ?? {})) {
      for (const d of devices) flat.push({ runtime, device: d });
    }

    const results = await Promise.all(
      flat.map(({ runtime, device }) =>
        this.limit(() => this.buildContainer(runtime, device)),
      ),
    );
    return results
      .filter((c): c is ContainerCandidate => c !== null)
      .sort((a, b) => b.totalSize - a.totalSize);
  }

  private async buildContainer(
    runtime: string,
    device: SimctlDevice,
  ): Promise<ContainerCandidate | null> {
    const devicePath = path.join(DEVICES_ROOT, device.udid);
    try {
      await fs.access(devicePath);
    } catch {
      return null;
    }

    const [totalSize, breakdown] = await Promise.all([
      this.sizes.size(devicePath),
      this.computeBreakdown(devicePath),
    ]);

    if (totalSize === 0) return null;

    const runtimeLabel = prettyRuntime(runtime);
    const name = `${device.name} · ${runtimeLabel}${device.isAvailable ? "" : " (no disponible)"}`;

    const actions = buildActions(device, devicePath, breakdown);

    return {
      id: `xcode:simulator:${device.udid}`,
      path: devicePath,
      name,
      kind: "ios_simulator",
      tool: Tool.Xcode,
      totalSize,
      breakdown,
      actions,
      selectedAction: null,
    };
  }

  private async computeBreakdown(devicePath: string): Promise<InternalComponent[]> {
    const data = path.join(devicePath, "data");
    const entries: Array<{ rel: string; role: InternalComponent["role"]; label: string }> = [
      { rel: "data/Library/Caches", role: "cache", label: "caches" },
      { rel: "data/tmp", role: "cache", label: "tmp" },
      { rel: "data/Library/Logs", role: "cache", label: "logs" },
      { rel: "data/Containers", role: "state", label: "apps & data" },
      { rel: "data/Library/SpringBoard", role: "state", label: "springboard" },
    ];

    const total = await this.sizes.size(data).catch(() => 0);
    const computed = await Promise.all(
      entries.map(async (e) => {
        const full = path.join(devicePath, e.rel);
        const size = await this.sizes.size(full).catch(() => 0);
        return { ...e, size };
      }),
    );

    const accounted = computed.reduce((s, c) => s + c.size, 0);
    const components: InternalComponent[] = computed
      .filter((c) => c.size > 0)
      .map((c) => ({ label: c.label, size: c.size, role: c.role }));

    const other = Math.max(0, total - accounted);
    if (other > 0) components.push({ label: "otros", size: other, role: "state" });
    return components.sort((a, b) => b.size - a.size);
  }
}

function prettyRuntime(raw: string): string {
  // raw e.g. "com.apple.CoreSimulator.SimRuntime.iOS-17-4"
  const m = raw.match(/SimRuntime\.([A-Za-z]+)-([\d-]+)$/);
  if (!m) return raw;
  const osName = m[1];
  const ver = (m[2] ?? "").replace(/-/g, ".");
  return `${osName} ${ver}`;
}

function buildActions(
  device: SimctlDevice,
  devicePath: string,
  breakdown: readonly InternalComponent[],
): ContainerAction[] {
  const cacheLike = breakdown
    .filter((c) => c.role === "cache" || c.role === "snapshot")
    .reduce((s, c) => s + c.size, 0);
  const total = breakdown.reduce((s, c) => s + c.size, 0);

  const softCleanPaths = [
    path.join(devicePath, "data/Library/Caches"),
    path.join(devicePath, "data/tmp"),
    path.join(devicePath, "data/Library/Logs"),
  ];

  return [
    {
      name: "soft_clean",
      risk: RiskLevel.Green,
      description: "Limpiar caches/logs/tmp (mantiene apps)",
      estimatedSize: cacheLike,
      execution: {
        kind: ExecutionKind.ContainerAction,
        path: softCleanPaths.join(":"),
        containerAction: "soft_clean",
      },
    },
    {
      name: "reset",
      risk: RiskLevel.Yellow,
      description: "Erase All Content & Settings (pierde apps/datos)",
      estimatedSize: total,
      execution: {
        kind: ExecutionKind.ContainerAction,
        executable: "/usr/bin/xcrun",
        args: ["simctl", "erase", device.udid],
        containerAction: "reset",
      },
    },
    {
      name: "delete",
      risk: RiskLevel.Yellow,
      description: "Borrar simulador completamente",
      estimatedSize: total,
      execution: {
        kind: ExecutionKind.ContainerAction,
        executable: "/usr/bin/xcrun",
        args: ["simctl", "delete", device.udid],
        containerAction: "delete",
      },
    },
  ];
}

export const __exportsForTest = { prettyRuntime, buildActions };

void Category;
