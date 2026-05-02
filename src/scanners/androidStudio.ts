import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import pLimit from "p-limit";
import { CleanupCandidate } from "../models/candidate.js";
import { Category, ExecutionKind, RiskLevel, Tool } from "../models/enums.js";
import { SizeCalculator } from "../services/sizeCalculator.js";

const HOME = os.homedir();

interface VersionedRoot {
  base: string;
  protectActive: boolean;
}

const ROOTS: VersionedRoot[] = [
  { base: path.join(HOME, "Library/Caches/Google"), protectActive: false },
  { base: path.join(HOME, "Library/Caches/JetBrains"), protectActive: false },
  { base: path.join(HOME, "Library/Logs/Google"), protectActive: false },
  { base: path.join(HOME, "Library/Application Support/Google"), protectActive: true },
  { base: path.join(HOME, "Library/Preferences"), protectActive: true },
];

const NAME_RE = /^AndroidStudio(\d{4})\.(\d+)\.(\d+)(?:[A-Za-z0-9.\-]*)$/;

export class AndroidStudioScanner {
  private limit = pLimit(8);
  constructor(private sizes: SizeCalculator = new SizeCalculator()) {}

  async scan(): Promise<CleanupCandidate[]> {
    const out: CleanupCandidate[] = [];
    for (const r of ROOTS) {
      out.push(...(await this.scanRoot(r)));
    }
    return out;
  }

  private async scanRoot(r: VersionedRoot): Promise<CleanupCandidate[]> {
    const entries = await safeReaddir(r.base);
    if (!entries) return [];

    const versioned: { name: string; ver: [number, number, number] }[] = [];
    for (const e of entries) {
      const isCandidate = e.isDirectory() || e.isFile() || e.isSymbolicLink();
      if (!isCandidate) continue;
      const m = NAME_RE.exec(e.name);
      if (!m) continue;
      versioned.push({
        name: e.name,
        ver: [Number(m[1]), Number(m[2]), Number(m[3])],
      });
    }

    if (versioned.length === 0) return [];

    versioned.sort((a, b) => cmpVer(b.ver, a.ver));
    const orphans = r.protectActive ? versioned.slice(1) : versioned;

    const picks = r.protectActive ? orphans : versioned;

    return Promise.all(
      picks.map((v) =>
        this.limit(async (): Promise<CleanupCandidate> => {
          const full = path.join(r.base, v.name);
          const size = await this.sizes.size(full);
          const isOrphan = r.protectActive;
          return {
            id: `android:studio:${r.base}:${v.name}`,
            path: full,
            displayName: v.name,
            risk: RiskLevel.Green,
            category: Category.AndroidStudioOrphan,
            tool: Tool.Android,
            size,
            reason: isOrphan
              ? "Versión huérfana de Android Studio"
              : "Caché/log de Android Studio",
            execution: { kind: ExecutionKind.Remove, path: full },
            selected: false,
          };
        }),
      ),
    ).then((arr) => arr.filter((c) => c.size > 0));
  }
}

function cmpVer(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

async function safeReaddir(p: string): Promise<import("node:fs").Dirent[] | null> {
  try {
    return await fs.readdir(p, { withFileTypes: true });
  } catch {
    return null;
  }
}
