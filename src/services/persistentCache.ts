import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const VERSION = 1;
const CACHE_DIR = path.join(os.homedir(), "Library/Caches/mdc");
const CACHE_FILE = path.join(CACHE_DIR, "sizes.json");

interface Entry {
  size: number;
  mtimeMs: number;
}

interface Persisted {
  version: number;
  entries: Record<string, Entry>;
}

export class PersistentSizeCache {
  private map = new Map<string, Entry>();
  private dirty = false;
  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const text = await fs.readFile(CACHE_FILE, "utf8");
      const data = JSON.parse(text) as Persisted;
      if (data.version !== VERSION) return;
      this.map = new Map(Object.entries(data.entries ?? {}));
    } catch {
      // missing/corrupt, start fresh
    }
  }

  async save(): Promise<void> {
    if (!this.dirty) return;
    try {
      await fs.mkdir(CACHE_DIR, { recursive: true });
      const data: Persisted = { version: VERSION, entries: Object.fromEntries(this.map) };
      await fs.writeFile(CACHE_FILE, JSON.stringify(data));
      this.dirty = false;
    } catch {
      // ignore
    }
  }

  get(target: string, mtimeMs: number): number | null {
    const e = this.map.get(target);
    if (!e) return null;
    if (e.mtimeMs !== mtimeMs) return null;
    return e.size;
  }

  set(target: string, size: number, mtimeMs: number): void {
    const prev = this.map.get(target);
    if (prev && prev.size === size && prev.mtimeMs === mtimeMs) return;
    this.map.set(target, { size, mtimeMs });
    this.dirty = true;
  }

  invalidate(target: string): void {
    if (this.map.delete(target)) this.dirty = true;
  }
}
