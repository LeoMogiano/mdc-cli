import { Tool } from "./enums.js";
import { CleanupCandidate } from "./candidate.js";
import { ContainerCandidate } from "./container.js";

export interface ToolReport {
  readonly tool: Tool;
  readonly candidates: readonly CleanupCandidate[];
  readonly containers: readonly ContainerCandidate[];
}

export function reclaimableOf(report: ToolReport): number {
  const candidates = report.candidates.reduce((sum, c) => sum + c.size, 0);
  const containers = report.containers.reduce((sum, c) => sum + c.totalSize, 0);
  return candidates + containers;
}

export interface ScanResult {
  readonly scannedAt: string;
  readonly reports: Partial<Record<Tool, ToolReport>>;
}

export function totalReclaimable(result: ScanResult): number {
  return Object.values(result.reports).reduce(
    (sum, r) => sum + (r ? reclaimableOf(r) : 0),
    0,
  );
}
