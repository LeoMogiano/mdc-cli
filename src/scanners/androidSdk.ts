import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import pLimit from "p-limit";
import { CleanupCandidate } from "../models/candidate.js";
import { Category, ExecutionKind, RiskLevel, Tool } from "../models/enums.js";
import { SizeCalculator } from "../services/sizeCalculator.js";

const HOME = os.homedir();
const SDK_ROOT = path.join(HOME, "Library/Android/sdk");

const VERSIONED = new Set([
  "system-images",
  "ndk",
  "cmake",
  "build-tools",
  "platforms",
]);

const FLAT_GREEN = new Set([
  "extras",
  "skins",
  "sources",
  "fonts",
  "icons",
  "add-ons",
  "docs",
  "samples",
]);

const FLAT_YELLOW = new Set(["emulator", "tools"]);

const FLAT_FILES_GREEN = new Set([
  "emu-update-last-check.ini",
  "modem-nv-ram-5554",
]);

interface ActiveImages {
  paths: Set<string>; // absolute paths to AVD-used system-image dirs
}

export class AndroidSdkScanner {
  private limit = pLimit(8);

  constructor(private sizes: SizeCalculator = new SizeCalculator()) {}

  async scan(): Promise<CleanupCandidate[]> {
    if (!(await pathExists(SDK_ROOT))) return [];

    const active = await readActiveSystemImages();
    const entries = await safeReaddir(SDK_ROOT);
    if (!entries) return [];

    const out: CleanupCandidate[] = [];

    for (const e of entries) {
      const full = path.join(SDK_ROOT, e.name);
      if (e.isFile() && FLAT_FILES_GREEN.has(e.name)) {
        const size = await this.sizes.size(full);
        if (size > 0) {
          out.push(makeCandidate({
            id: `android:sdk:file:${e.name}`,
            path: full,
            displayName: e.name,
            risk: RiskLevel.Green,
            category: Category.AndroidSdkAux,
            size,
            reason: "Marcador SDK",
            execution: { kind: ExecutionKind.Remove, path: full },
          }));
        }
        continue;
      }
      if (!e.isDirectory()) continue;

      if (VERSIONED.has(e.name)) {
        out.push(...(await this.scanVersioned(e.name, full, active)));
      } else if (FLAT_YELLOW.has(e.name)) {
        const size = await this.sizes.size(full);
        if (size > 0) {
          out.push(makeCandidate({
            id: `android:sdk:flatY:${e.name}`,
            path: full,
            displayName: e.name,
            risk: RiskLevel.Yellow,
            category: Category.AndroidSdkBinaries,
            size,
            reason: e.name === "emulator" ? "Binarios emulador (reinstalable)" : "Tools deprecados",
            execution: { kind: ExecutionKind.Remove, path: full },
          }));
        }
      } else if (FLAT_GREEN.has(e.name)) {
        const size = await this.sizes.size(full);
        if (size > 0) {
          out.push(makeCandidate({
            id: `android:sdk:flatG:${e.name}`,
            path: full,
            displayName: e.name,
            risk: RiskLevel.Green,
            category: Category.AndroidSdkAux,
            size,
            reason: "Auxiliar SDK",
            execution: { kind: ExecutionKind.Remove, path: full },
          }));
        }
      }
    }

    return out.sort((a, b) => b.size - a.size);
  }

  private async scanVersioned(
    name: string,
    fullDir: string,
    active: ActiveImages,
  ): Promise<CleanupCandidate[]> {
    if (name === "system-images") {
      return this.scanSystemImages(fullDir, active);
    }

    const entries = await safeReaddir(fullDir);
    if (!entries) return [];
    const dirs = entries.filter((e) => e.isDirectory());

    const sorted = [...dirs].sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));
    const latest = sorted[0]?.name;

    return Promise.all(
      sorted.map((entry) =>
        this.limit(async (): Promise<CleanupCandidate> => {
          const full = path.join(fullDir, entry.name);
          const size = await this.sizes.size(full);
          const isLatest = entry.name === latest;
          return makeCandidate({
            id: `android:sdk:${name}:${entry.name}`,
            path: full,
            displayName: `${name}/${entry.name}`,
            risk: RiskLevel.Yellow,
            category: Category.AndroidSdkVersioned,
            size,
            reason: isLatest
              ? `Última versión ${name} (probablemente activa)`
              : `Versión antigua ${name}`,
            execution: { kind: ExecutionKind.Remove, path: full },
            group: name,
          });
        }),
      ),
    ).then((arr) => arr.filter((c) => c.size > 0));
  }

  private async scanSystemImages(
    fullDir: string,
    active: ActiveImages,
  ): Promise<CleanupCandidate[]> {
    // ~/Library/Android/sdk/system-images/<api>/<variant>/<arch>
    const apis = await safeReaddir(fullDir);
    if (!apis) return [];

    const out: CleanupCandidate[] = [];
    for (const api of apis) {
      if (!api.isDirectory()) continue;
      const apiDir = path.join(fullDir, api.name);
      const variants = await safeReaddir(apiDir);
      if (!variants) continue;
      for (const variant of variants) {
        if (!variant.isDirectory()) continue;
        const variantDir = path.join(apiDir, variant.name);
        const archs = await safeReaddir(variantDir);
        if (!archs) continue;
        for (const arch of archs) {
          if (!arch.isDirectory()) continue;
          const archDir = path.join(variantDir, arch.name);
          const inUse = active.paths.has(archDir);
          if (inUse) continue; // skip — used by AVD
          const size = await this.sizes.size(archDir);
          if (size === 0) continue;
          out.push(makeCandidate({
            id: `android:sdk:system-images:${api.name}:${variant.name}:${arch.name}`,
            path: archDir,
            displayName: `${api.name}/${variant.name}/${arch.name}`,
            risk: RiskLevel.Yellow,
            category: Category.AndroidSdkSystemImages,
            size,
            reason: "System image (no usada por AVDs detectados)",
            execution: { kind: ExecutionKind.Remove, path: archDir },
          }));
        }
      }
    }
    return out;
  }
}

async function readActiveSystemImages(): Promise<ActiveImages> {
  const avdRoot = path.join(HOME, ".android/avd");
  const out: Set<string> = new Set();
  const entries = await safeReaddir(avdRoot);
  if (!entries) return { paths: out };
  for (const e of entries) {
    if (!e.isDirectory() || !e.name.endsWith(".avd")) continue;
    const cfg = path.join(avdRoot, e.name, "config.ini");
    try {
      const text = await fs.readFile(cfg, "utf8");
      const m = text.match(/^image\.sysdir\.1\s*=\s*(.+)$/m);
      if (!m) continue;
      const rel = (m[1] ?? "").trim().replace(/\/$/, "");
      if (!rel) continue;
      const full = path.join(SDK_ROOT, rel);
      out.add(full);
    } catch {
      // skip
    }
  }
  return { paths: out };
}

function makeCandidate(p: Omit<CleanupCandidate, "tool" | "selected">): CleanupCandidate {
  return {
    ...p,
    tool: Tool.Android,
    selected: false,
  };
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
