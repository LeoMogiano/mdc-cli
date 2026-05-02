import { promises as fs } from "node:fs";
import { CleanupCandidate } from "./models/candidate.js";
import { ContainerCandidate, ContainerAction } from "./models/container.js";
import { ExecutionKind } from "./models/enums.js";
import { ProcessRunner } from "./services/processRunner.js";

export interface CleanupOpItem {
  id: string;
  label: string;
  size: number;
  source: "candidate" | "container";
}

export interface CleanupOpResult {
  item: CleanupOpItem;
  ok: boolean;
  freed: number;
  error?: string;
}

export interface CleanupRunResult {
  results: CleanupOpResult[];
  totalFreed: number;
  totalErrors: number;
}

type ProgressCb = (op: CleanupOpResult) => void;

export interface CleanerOptions {
  runningAvds?: string[];
}

export class Cleaner {
  private cancelled = false;
  private runningAvds: Set<string>;

  constructor(
    private runner: ProcessRunner = new ProcessRunner(),
    opts: CleanerOptions = {},
  ) {
    this.runningAvds = new Set(opts.runningAvds ?? []);
  }

  cancel(): void {
    this.cancelled = true;
  }

  async run(
    candidates: CleanupCandidate[],
    containers: ContainerCandidate[],
    onProgress?: ProgressCb,
  ): Promise<CleanupRunResult> {
    const results: CleanupOpResult[] = [];
    let totalFreed = 0;
    let totalErrors = 0;

    for (const c of candidates) {
      if (!c.selected) continue;
      if (this.cancelled) break;
      const item: CleanupOpItem = {
        id: c.id,
        label: c.displayName,
        size: c.size,
        source: "candidate",
      };
      const r = await this.execCandidate(c, item);
      results.push(r);
      if (r.ok) totalFreed += r.freed;
      else totalErrors += 1;
      onProgress?.(r);
    }

    for (const cont of containers) {
      if (!cont.selectedAction) continue;
      if (this.cancelled) break;
      const action = cont.actions.find((a) => a.name === cont.selectedAction);
      if (!action) continue;
      const item: CleanupOpItem = {
        id: cont.id,
        label: `${cont.name} [${cont.selectedAction}]`,
        size: action.estimatedSize,
        source: "container",
      };
      // Skip running AVDs.
      if (cont.kind === "android_avd") {
        const avdName = cont.name.split(" · ")[0] ?? "";
        if (avdName && this.runningAvds.has(avdName)) {
          const r: CleanupOpResult = {
            item,
            ok: false,
            freed: 0,
            error: "AVD en ejecución — cerralo antes",
          };
          results.push(r);
          totalErrors += 1;
          onProgress?.(r);
          continue;
        }
      }
      const r = await this.execContainer(cont, action, item);
      results.push(r);
      if (r.ok) totalFreed += r.freed;
      else totalErrors += 1;
      onProgress?.(r);
    }

    return { results, totalFreed, totalErrors };
  }

  private async execCandidate(
    c: CleanupCandidate,
    item: CleanupOpItem,
  ): Promise<CleanupOpResult> {
    switch (c.execution.kind) {
      case ExecutionKind.Remove:
        return this.removePath(c.execution.path ?? c.path, item);
      case ExecutionKind.CliCommand:
        return this.runCli(
          c.execution.executable ?? "",
          c.execution.args ?? [],
          item,
        );
      case ExecutionKind.ContainerAction:
        return { item, ok: false, freed: 0, error: "ContainerAction sobre candidato" };
    }
  }

  private async execContainer(
    c: ContainerCandidate,
    action: ContainerAction,
    item: CleanupOpItem,
  ): Promise<CleanupOpResult> {
    const exec = action.execution;
    if (exec.kind === ExecutionKind.ContainerAction) {
      // soft_clean / reset: path puede ser colon-joined.
      // delete: usa executable + args (avdmanager/simctl).
      if (exec.executable && exec.args) {
        return this.runCli(exec.executable, exec.args, item);
      }
      const paths = (exec.path ?? "").split(":").filter(Boolean);
      let freed = 0;
      const errors: string[] = [];
      for (const p of paths) {
        const r = await this.removePath(p, item);
        if (r.ok) freed += r.freed;
        else if (r.error) errors.push(r.error);
      }
      if (errors.length === paths.length && paths.length > 0) {
        return { item, ok: false, freed, error: errors.join("; ") };
      }
      return { item, ok: true, freed };
    }
    if (exec.kind === ExecutionKind.Remove) {
      return this.removePath(exec.path ?? "", item);
    }
    if (exec.kind === ExecutionKind.CliCommand) {
      return this.runCli(exec.executable ?? "", exec.args ?? [], item);
    }
    return { item, ok: false, freed: 0, error: "Estrategia desconocida" };
  }

  private async removePath(target: string, item: CleanupOpItem): Promise<CleanupOpResult> {
    if (!target) return { item, ok: false, freed: 0, error: "Sin path" };
    try {
      // Pre-existence check; rm with force ignores nonexistent silently.
      await fs.access(target);
    } catch {
      return { item, ok: true, freed: 0 };
    }
    try {
      await fs.rm(target, { recursive: true, force: false });
      return { item, ok: true, freed: item.size };
    } catch (e) {
      return {
        item,
        ok: false,
        freed: 0,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  private async runCli(
    executable: string,
    args: readonly string[],
    item: CleanupOpItem,
  ): Promise<CleanupOpResult> {
    if (!executable) return { item, ok: false, freed: 0, error: "Sin ejecutable" };
    const r = await this.runner.run(executable, args, { timeoutMs: 60_000 });
    if (r.exitCode === 0) {
      return { item, ok: true, freed: item.size };
    }
    return {
      item,
      ok: false,
      freed: 0,
      error: r.stderr || `exit ${r.exitCode}`,
    };
  }
}
