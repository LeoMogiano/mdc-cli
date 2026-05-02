import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { Cleaner } from "../src/cleaner.js";
import { CleanupCandidate } from "../src/models/candidate.js";
import { Category, ExecutionKind, RiskLevel, Tool } from "../src/models/enums.js";

describe("Cleaner", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "cleaner-"));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  function makeCandidate(p: string, selected: boolean): CleanupCandidate {
    return {
      id: `t:${p}`,
      path: p,
      displayName: path.basename(p),
      risk: RiskLevel.Green,
      category: Category.DerivedData,
      tool: Tool.Xcode,
      size: 1024,
      reason: "test",
      execution: { kind: ExecutionKind.Remove, path: p },
      selected,
    };
  }

  it("removes selected paths and skips non-selected", async () => {
    const a = path.join(dir, "a");
    const b = path.join(dir, "b");
    await fs.mkdir(a);
    await fs.writeFile(path.join(a, "f"), "x".repeat(2048));
    await fs.mkdir(b);
    await fs.writeFile(path.join(b, "f"), "y".repeat(2048));

    const cleaner = new Cleaner();
    const r = await cleaner.run([makeCandidate(a, true), makeCandidate(b, false)], []);
    expect(r.totalErrors).toBe(0);
    await expect(fs.access(a)).rejects.toThrow();
    await expect(fs.access(b)).resolves.toBeUndefined();
    expect(r.results.length).toBe(1);
  });

  it("reports error on missing path silently as ok=true with freed=0", async () => {
    const ghost = path.join(dir, "ghost");
    const cleaner = new Cleaner();
    const r = await cleaner.run([makeCandidate(ghost, true)], []);
    expect(r.totalErrors).toBe(0);
    expect(r.results[0]?.freed).toBe(0);
  });

  it("calls progress callback per op", async () => {
    const a = path.join(dir, "a");
    await fs.mkdir(a);
    const updates: string[] = [];
    const cleaner = new Cleaner();
    await cleaner.run([makeCandidate(a, true)], [], (op) => updates.push(op.item.label));
    expect(updates).toEqual(["a"]);
  });
});
