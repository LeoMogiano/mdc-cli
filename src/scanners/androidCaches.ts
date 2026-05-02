import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CleanupCandidate } from "../models/candidate.js";
import { Category, ExecutionKind, RiskLevel, Tool } from "../models/enums.js";
import { SizeCalculator } from "../services/sizeCalculator.js";

const HOME = os.homedir();

const CACHES = [
  { rel: ".android/cache", reason: "Metadata SDK downloads" },
  { rel: ".android/build-cache", reason: "Build cache compartido" },
  { rel: ".android/metrics", reason: "Analytics" },
];

export class AndroidCachesScanner {
  constructor(private sizes: SizeCalculator = new SizeCalculator()) {}

  async scan(): Promise<CleanupCandidate[]> {
    const out: CleanupCandidate[] = [];
    for (const c of CACHES) {
      const full = path.join(HOME, c.rel);
      try {
        await fs.access(full);
      } catch {
        continue;
      }
      const size = await this.sizes.size(full);
      if (size === 0) continue;
      out.push({
        id: `android:cache:${c.rel}`,
        path: full,
        displayName: path.basename(full),
        risk: RiskLevel.Green,
        category: Category.AndroidCaches,
        tool: Tool.Android,
        size,
        reason: c.reason,
        execution: { kind: ExecutionKind.Remove, path: full },
        selected: false,
      });
    }
    return out;
  }
}
