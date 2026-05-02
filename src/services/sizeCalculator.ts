import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile, ChildProcess } from "node:child_process";
import { PersistentSizeCache } from "./persistentCache.js";

const BLOCK_SIZE = 512;
const BATCH = 128;

export interface SizeCalculatorOptions {
  useDu?: boolean; // default true on darwin/linux
  persistent?: PersistentSizeCache | null;
}

export class SizeCalculator {
  private cache = new Map<string, number>();
  private useDu: boolean;
  private persistent: PersistentSizeCache | null;
  private active = new Set<ChildProcess>();
  private cancelled = false;

  constructor(opts: SizeCalculatorOptions = {}) {
    this.useDu = opts.useDu ?? (process.platform === "darwin" || process.platform === "linux");
    this.persistent = opts.persistent ?? null;
  }

  cancel(): void {
    this.cancelled = true;
    for (const p of this.active) {
      try {
        p.kill("SIGTERM");
      } catch {
        // ignore
      }
    }
    this.active.clear();
  }

  async size(target: string): Promise<number> {
    const cached = this.cache.get(target);
    if (cached !== undefined) return cached;
    const total = await this.compute(target);
    this.cache.set(target, total);
    return total;
  }

  invalidate(target?: string): void {
    if (target === undefined) {
      this.cache.clear();
    } else {
      this.cache.delete(target);
      this.persistent?.invalidate(target);
    }
  }

  private async compute(target: string): Promise<number> {
    if (this.cancelled) return 0;
    let stat;
    try {
      stat = await fs.lstat(target);
    } catch {
      return 0;
    }
    if (stat.isSymbolicLink()) return 0;

    // Persistent cache hit by mtime.
    if (this.persistent) {
      const hit = this.persistent.get(target, stat.mtimeMs);
      if (hit !== null) return hit;
    }

    let total: number;
    if (this.useDu && stat.isDirectory()) {
      const fast = await this.duSize(target);
      if (fast !== null) {
        total = fast;
      } else {
        total = await this.computeNode(target);
      }
    } else if (!stat.isDirectory()) {
      total = blocksToBytes(stat.blocks);
    } else {
      total = await this.computeNode(target);
    }

    this.persistent?.set(target, total, stat.mtimeMs);
    return total;
  }

  private async duSize(target: string): Promise<number | null> {
    if (this.cancelled) return 0;
    return new Promise<number | null>((resolve) => {
      const child = execFile(
        "/usr/bin/du",
        ["-sk", target],
        { timeout: 60_000, maxBuffer: 1024 * 1024 },
        (err, stdout) => {
          this.active.delete(child);
          if (err || !stdout) {
            resolve(null);
            return;
          }
          const m = stdout.match(/^(\d+)/);
          if (!m) {
            resolve(null);
            return;
          }
          const kib = Number(m[1]);
          if (!Number.isFinite(kib)) {
            resolve(null);
            return;
          }
          resolve(kib * 1024);
        },
      );
      this.active.add(child);
    });
  }

  private async computeNode(target: string): Promise<number> {
    let stat;
    try {
      stat = await fs.lstat(target);
    } catch {
      return 0;
    }
    if (stat.isSymbolicLink()) return 0;
    if (!stat.isDirectory()) return blocksToBytes(stat.blocks);

    let total = blocksToBytes(stat.blocks);
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(target, { withFileTypes: true });
    } catch {
      return total;
    }

    for (let i = 0; i < entries.length; i += BATCH) {
      const slice = entries.slice(i, i + BATCH);
      const sizes = await Promise.all(
        slice.map((e) => this.computeNode(path.join(target, e.name))),
      );
      for (const s of sizes) total += s;
    }
    return total;
  }
}

function blocksToBytes(blocks: number | undefined): number {
  if (typeof blocks !== "number" || !Number.isFinite(blocks) || blocks < 0) return 0;
  return blocks * BLOCK_SIZE;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
}
