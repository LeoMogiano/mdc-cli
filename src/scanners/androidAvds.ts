import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import pLimit from "p-limit";
import { ContainerCandidate, ContainerAction, InternalComponent } from "../models/container.js";
import { ExecutionKind, RiskLevel, Tool } from "../models/enums.js";
import { ProcessRunner } from "../services/processRunner.js";
import { SizeCalculator } from "../services/sizeCalculator.js";

const HOME = os.homedir();
const AVD_ROOT = path.join(HOME, ".android/avd");
const AVDMANAGER = path.join(
  HOME,
  "Library/Android/sdk/cmdline-tools/latest/bin/avdmanager",
);
const EMULATOR_BIN = path.join(HOME, "Library/Android/sdk/emulator/emulator");

interface AvdEntry {
  name: string;
  iniPath: string;
  avdDir: string;
}

export class AndroidAvdsScanner {
  private limit = pLimit(4);

  constructor(
    private runner: ProcessRunner = new ProcessRunner(),
    private sizes: SizeCalculator = new SizeCalculator(),
  ) {}

  async scan(): Promise<ContainerCandidate[]> {
    const avds = await this.enumerateAvds();
    if (avds.length === 0) return [];

    const results = await Promise.all(
      avds.map((avd) => this.limit(() => this.buildContainer(avd))),
    );
    return results
      .filter((c): c is ContainerCandidate => c !== null)
      .sort((a, b) => b.totalSize - a.totalSize);
  }

  private async enumerateAvds(): Promise<AvdEntry[]> {
    const entries = await safeReaddir(AVD_ROOT);
    if (!entries) return [];

    const avds: AvdEntry[] = [];
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith(".ini")) {
        const name = e.name.replace(/\.ini$/, "");
        const ini = path.join(AVD_ROOT, e.name);
        const avdDir = path.join(AVD_ROOT, `${name}.avd`);
        if (await pathExists(avdDir)) {
          avds.push({ name, iniPath: ini, avdDir });
        }
      }
    }
    return avds;
  }

  private async buildContainer(avd: AvdEntry): Promise<ContainerCandidate | null> {
    const totalSize = await this.sizes.size(avd.avdDir);
    if (totalSize === 0) return null;

    const breakdown = await this.computeBreakdown(avd.avdDir);
    const sysImage = await this.readSystemImage(avd.avdDir);

    const name = sysImage ? `${avd.name} · ${sysImage}` : avd.name;

    const actions = buildActions(avd, breakdown);

    return {
      id: `android:avd:${avd.name}`,
      path: avd.avdDir,
      name,
      kind: "android_avd",
      tool: Tool.Android,
      totalSize,
      breakdown,
      actions,
      selectedAction: null,
    };
  }

  private async computeBreakdown(avdDir: string): Promise<InternalComponent[]> {
    const total = await this.sizes.size(avdDir).catch(() => 0);

    // Targeted entries.
    const userdataFiles = await listMatching(avdDir, /^userdata.*\.img(\.qcow2)?$/);
    const cacheFiles = await listMatching(avdDir, /^cache\.img(\.qcow2)?$/);
    const sdcard = path.join(avdDir, "sdcard.img");
    const snapshots = path.join(avdDir, "snapshots");
    const tmpAdb = path.join(avdDir, "tmpAdbCmds");

    const sumPaths = async (paths: string[]) => {
      let s = 0;
      for (const p of paths) s += await this.sizes.size(p).catch(() => 0);
      return s;
    };

    const [userdataSize, cacheSize, sdcardSize, snapshotsSize, tmpSize] = await Promise.all([
      sumPaths(userdataFiles),
      sumPaths(cacheFiles),
      this.sizes.size(sdcard).catch(() => 0),
      this.sizes.size(snapshots).catch(() => 0),
      this.sizes.size(tmpAdb).catch(() => 0),
    ]);

    const components: InternalComponent[] = [];
    if (userdataSize > 0)
      components.push({ label: "userdata", size: userdataSize, role: "state" });
    if (snapshotsSize > 0)
      components.push({ label: "snapshots", size: snapshotsSize, role: "snapshot" });
    if (cacheSize > 0) components.push({ label: "cache", size: cacheSize, role: "cache" });
    if (sdcardSize > 0)
      components.push({ label: "sdcard", size: sdcardSize, role: "state" });
    if (tmpSize > 0) components.push({ label: "tmp adb", size: tmpSize, role: "cache" });

    const accounted = components.reduce((s, c) => s + c.size, 0);
    const other = Math.max(0, total - accounted);
    if (other > 0) components.push({ label: "otros", size: other, role: "state" });

    return components.sort((a, b) => b.size - a.size);
  }

  private async readSystemImage(avdDir: string): Promise<string | null> {
    const cfg = path.join(avdDir, "config.ini");
    try {
      const text = await fs.readFile(cfg, "utf8");
      const m = text.match(/^image\.sysdir\.1\s*=\s*(.+)$/m);
      if (!m) return null;
      const raw = (m[1] ?? "").trim();
      // raw e.g. "system-images/android-34/google_apis_playstore/arm64-v8a"
      const parts = raw.split("/");
      const api = parts[1] ?? "";
      const variant = parts[2] ?? "";
      return [api, variant].filter(Boolean).join(" ");
    } catch {
      return null;
    }
  }
}

function buildActions(avd: AvdEntry, breakdown: readonly InternalComponent[]): ContainerAction[] {
  const cacheLike = breakdown
    .filter((c) => c.role === "cache" || c.role === "snapshot")
    .reduce((s, c) => s + c.size, 0);
  const total = breakdown.reduce((s, c) => s + c.size, 0);

  return [
    {
      name: "soft_clean",
      risk: RiskLevel.Green,
      description: "Borra snapshots/cache/tmp (mantiene apps y datos)",
      estimatedSize: cacheLike,
      execution: {
        kind: ExecutionKind.ContainerAction,
        path: [
          path.join(avd.avdDir, "snapshots"),
          path.join(avd.avdDir, "cache.img"),
          path.join(avd.avdDir, "cache.img.qcow2"),
          path.join(avd.avdDir, "tmpAdbCmds"),
        ].join(":"),
        containerAction: "soft_clean",
      },
    },
    {
      name: "reset",
      risk: RiskLevel.Yellow,
      description: "Borra userdata/sdcard (pierde apps y datos)",
      estimatedSize: total,
      execution: {
        kind: ExecutionKind.ContainerAction,
        path: [
          path.join(avd.avdDir, "userdata-qemu.img"),
          path.join(avd.avdDir, "userdata-qemu.img.qcow2"),
          path.join(avd.avdDir, "userdata.img"),
          path.join(avd.avdDir, "sdcard.img"),
        ].join(":"),
        containerAction: "reset",
      },
    },
    {
      name: "delete",
      risk: RiskLevel.Yellow,
      description: "Borra el AVD entero (avdmanager delete avd)",
      estimatedSize: total,
      execution: {
        kind: ExecutionKind.ContainerAction,
        executable: AVDMANAGER,
        args: ["delete", "avd", "-n", avd.name],
        containerAction: "delete",
      },
    },
  ];
}

async function listMatching(dir: string, re: RegExp): Promise<string[]> {
  const entries = await safeReaddir(dir);
  if (!entries) return [];
  return entries
    .filter((e) => e.isFile() && re.test(e.name))
    .map((e) => path.join(dir, e.name));
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function safeReaddir(p: string): Promise<import("node:fs").Dirent[] | null> {
  try {
    return await fs.readdir(p, { withFileTypes: true });
  } catch {
    return null;
  }
}

void EMULATOR_BIN;
