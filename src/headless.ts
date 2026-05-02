import { Command } from "commander";
import { promises as fs } from "node:fs";
import { XcodeScanner } from "./scanners/xcode.js";
import { AndroidScanner } from "./scanners/android.js";
import { ScanResult } from "./models/scan.js";
import { Tool } from "./models/enums.js";
import { scanResultToJson } from "./output/jsonOut.js";
import { Cleaner } from "./cleaner.js";
import { CleanupCandidate } from "./models/candidate.js";
import { ContainerCandidate } from "./models/container.js";
import { formatBytes, SizeCalculator } from "./services/sizeCalculator.js";
import { PersistentSizeCache } from "./services/persistentCache.js";

export async function runHeadless(argv: string[]): Promise<number> {
  const program = new Command();
  program
    .name("mdc")
    .description("Mobile Dev Cleaner — TUI / headless")
    .version("1.0.0");

  program
    .command("scan")
    .description("Scan and emit results.")
    .option("--tool <tool>", "limit to tool (xcode|android|all)", "all")
    .option("--category <cat>", "limit to category (e.g. derived-data)")
    .option("--json", "emit JSON to stdout", false)
    .action(async (opts: { tool: string; category?: string; json: boolean }) => {
      const result: ScanResult = {
        scannedAt: new Date().toISOString(),
        reports: {},
      };

      const cache = new PersistentSizeCache();
      await cache.load();
      const sizes = new SizeCalculator({ persistent: cache });
      const tasks: Promise<void>[] = [];
      if (opts.tool === "xcode" || opts.tool === "all") {
        tasks.push(
          new XcodeScanner(sizes).scan().then((r) => {
            result.reports[Tool.Xcode] = r;
          }),
        );
      }
      if (opts.tool === "android" || opts.tool === "all") {
        tasks.push(
          new AndroidScanner(sizes).scan().then((r) => {
            result.reports[Tool.Android] = r;
          }),
        );
      }
      if (tasks.length === 0) {
        process.stderr.write(`Tool '${opts.tool}' invalid.\n`);
        process.exitCode = 2;
        return;
      }
      await Promise.all(tasks);
      await cache.save();

      if (opts.json) {
        process.stdout.write(scanResultToJson(result) + "\n");
      } else {
        for (const tool of [Tool.Xcode, Tool.Android] as const) {
          const r = result.reports[tool];
          if (!r) continue;
          for (const c of r.candidates) {
            process.stdout.write(`${c.size}\t${tool}\t${c.path}\n`);
          }
        }
      }
    });

  program
    .command("clean")
    .description("Execute cleanup against a previously generated plan JSON.")
    .requiredOption("--plan <file>", "ScanResult JSON with selected:true items")
    .option("--execute", "actually delete (without this flag, dry-run)", false)
    .option("--yes", "skip confirmation prompt", false)
    .action(async (opts: { plan: string; execute: boolean; yes: boolean }) => {
      const text = await fs.readFile(opts.plan, "utf8").catch((e) => {
        process.stderr.write(`Cannot read plan: ${(e as Error).message}\n`);
        process.exitCode = 2;
        return null;
      });
      if (text === null) return;
      let plan: ScanResult;
      try {
        plan = JSON.parse(text) as ScanResult;
      } catch (e) {
        process.stderr.write(`Invalid plan JSON: ${(e as Error).message}\n`);
        process.exitCode = 2;
        return;
      }
      const candidates: CleanupCandidate[] = [];
      const containers: ContainerCandidate[] = [];
      for (const r of Object.values(plan.reports ?? {})) {
        if (!r) continue;
        candidates.push(...r.candidates);
        containers.push(...r.containers);
      }
      const selCandidates = candidates.filter((c) => c.selected);
      const selContainers = containers.filter((c) => c.selectedAction !== null);
      const totalSize =
        selCandidates.reduce((s, c) => s + c.size, 0) +
        selContainers.reduce((s, c) => {
          const a = c.actions.find((x) => x.name === c.selectedAction);
          return s + (a?.estimatedSize ?? 0);
        }, 0);
      const total = selCandidates.length + selContainers.length;

      if (!opts.execute) {
        process.stdout.write(`DRY-RUN: ${total} items, ${formatBytes(totalSize)}\n`);
        for (const c of selCandidates) {
          process.stdout.write(`  candidate ${c.size}\t${c.path}\n`);
        }
        for (const c of selContainers) {
          process.stdout.write(`  container ${c.id} action=${c.selectedAction}\n`);
        }
        return;
      }
      if (!opts.yes) {
        process.stderr.write("Refusing to execute without --yes.\n");
        process.exitCode = 2;
        return;
      }
      const cleaner = new Cleaner();
      const r = await cleaner.run(candidates, containers, (op) => {
        const sym = op.ok ? "OK " : "ERR";
        process.stdout.write(
          `${sym} ${formatBytes(op.freed).padStart(10)}\t${op.item.label}${
            op.error ? `  · ${op.error}` : ""
          }\n`,
        );
      });
      process.stdout.write(
        `\nFreed ${formatBytes(r.totalFreed)}; ${r.results.length - r.totalErrors} ok, ${r.totalErrors} errors\n`,
      );
      if (r.totalErrors > 0) process.exitCode = 1;
    });

  await program.parseAsync(argv, { from: "user" });
  const ec = process.exitCode;
  return typeof ec === "number" ? ec : 0;
}
