import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { SizeCalculator, formatBytes } from "../../src/services/sizeCalculator.js";

describe("SizeCalculator", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "sizecalc-"));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("returns 0 for nonexistent path", async () => {
    const calc = new SizeCalculator();
    expect(await calc.size(path.join(dir, "nope"))).toBe(0);
  });

  it("computes size of single file (>0 when content exists)", async () => {
    const f = path.join(dir, "a.txt");
    await fs.writeFile(f, "x".repeat(8192));
    const calc = new SizeCalculator();
    const size = await calc.size(f);
    expect(size).toBeGreaterThan(0);
  });

  it("recurses into directories", async () => {
    const sub = path.join(dir, "sub");
    await fs.mkdir(sub);
    await fs.writeFile(path.join(sub, "x"), "x".repeat(4096));
    await fs.writeFile(path.join(sub, "y"), "y".repeat(4096));
    const calc = new SizeCalculator();
    const total = await calc.size(dir);
    expect(total).toBeGreaterThan(0);
  });

  it("caches results", async () => {
    const calc = new SizeCalculator();
    const first = await calc.size(dir);
    await fs.writeFile(path.join(dir, "new"), "data");
    const second = await calc.size(dir);
    expect(second).toBe(first);
    calc.invalidate();
    const third = await calc.size(dir);
    expect(third).toBeGreaterThanOrEqual(first);
  });

  it("ignores symlinks", async () => {
    const target = path.join(dir, "real");
    await fs.writeFile(target, "x".repeat(4096));
    const link = path.join(dir, "link");
    await fs.symlink(target, link);
    const calc = new SizeCalculator();
    expect(await calc.size(link)).toBe(0);
  });
});

describe("formatBytes", () => {
  it("formats bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toMatch(/KB$/);
    expect(formatBytes(5 * 1024 * 1024)).toMatch(/MB$/);
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toMatch(/GB$/);
  });
});
