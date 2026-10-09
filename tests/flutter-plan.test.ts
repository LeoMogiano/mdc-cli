import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { Cleaner } from "../src/cleaner.js";
import { CleanupCandidate } from "../src/models/candidate.js";
import { Category, ExecutionKind, RiskLevel, Tool } from "../src/models/enums.js";
import { ScanResult } from "../src/models/scan.js";

describe("Flutter plan execution", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "flutter-plan-"));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  function makeFlutterCandidate(p: string, selected: boolean): CleanupCandidate {
    return {
      id: `flutter:${p}`,
      path: p,
      displayName: path.basename(p),
      risk: RiskLevel.Green,
      category: Category.PubCache,
      tool: Tool.Flutter,
      size: 1024,
      reason: "test",
      execution: { kind: ExecutionKind.Remove, path: p },
      selected,
    };
  }

  it("dry-run lists flutter candidates", async () => {
    const candidate = makeFlutterCandidate(path.join(dir, "pub-cache"), true);
    const plan: ScanResult = {
      scannedAt: new Date().toISOString(),
      reports: {
        [Tool.Flutter]: {
          tool: Tool.Flutter,
          candidates: [candidate],
          containers: [],
        },
      },
    };

    const cleaner = new Cleaner();
    const candidates = [...(plan.reports[Tool.Flutter]?.candidates ?? [])];
    const results = await cleaner.run(candidates, []);

    // Dry run should skip non-existent paths gracefully
    expect(results.totalErrors).toBe(0);
  });

  it("executes flutter plan with selected:true", async () => {
    const pubCache = path.join(dir, "pub-cache");
    await fs.mkdir(pubCache);
    await fs.writeFile(path.join(pubCache, "pkg.txt"), "package data");

    const candidate = makeFlutterCandidate(pubCache, true);
    const cleaner = new Cleaner();
    const r = await cleaner.run([candidate], []);

    expect(r.totalErrors).toBe(0);
    expect(r.results.length).toBe(1);
    expect(r.results[0]?.ok).toBe(true);
    await expect(fs.access(pubCache)).rejects.toThrow();
  });

  it("skips flutter candidates with selected:false", async () => {
    const pubCache = path.join(dir, "pub-cache");
    await fs.mkdir(pubCache);

    const candidate = makeFlutterCandidate(pubCache, false);
    const cleaner = new Cleaner();
    const r = await cleaner.run([candidate], []);

    expect(r.results.length).toBe(0);
    await expect(fs.access(pubCache)).resolves.toBeUndefined();
  });

  it("handles flutter .dart_tool in project", async () => {
    const project = path.join(dir, "my-flutter-app");
    const dartTool = path.join(project, ".dart_tool");
    await fs.mkdir(dartTool, { recursive: true });
    await fs.writeFile(path.join(dartTool, "generated.txt"), "generated cache");

    const candidate = makeFlutterCandidate(dartTool, true);
    const cleaner = new Cleaner();
    const r = await cleaner.run([candidate], []);

    expect(r.totalErrors).toBe(0);
    expect(r.results[0]?.ok).toBe(true);
    await expect(fs.access(dartTool)).rejects.toThrow();
  });

  it("mixed flutter and xcode candidates in one plan", async () => {
    const pubCache = path.join(dir, "pub-cache");
    const xcodeCache = path.join(dir, "xcode-cache");
    await fs.mkdir(pubCache);
    await fs.mkdir(xcodeCache);

    const flutterCandidate = makeFlutterCandidate(pubCache, true);
    const xcodeCandidate: CleanupCandidate = {
      id: "xcode:cache",
      path: xcodeCache,
      displayName: "Xcode Cache",
      risk: RiskLevel.Green,
      category: Category.XcodeCaches,
      tool: Tool.Xcode,
      size: 2048,
      reason: "test",
      execution: { kind: ExecutionKind.Remove, path: xcodeCache },
      selected: true,
    };

    const cleaner = new Cleaner();
    const r = await cleaner.run([flutterCandidate, xcodeCandidate], []);

    expect(r.results.length).toBe(2);
    expect(r.totalErrors).toBe(0);
    await expect(fs.access(pubCache)).rejects.toThrow();
    await expect(fs.access(xcodeCache)).rejects.toThrow();
  });
});
