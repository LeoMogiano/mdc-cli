import { RiskLevel, Tool, Category } from "./enums.js";
import { ExecutionStrategy } from "./execution.js";

export interface CleanupCandidate {
  readonly id: string;
  readonly path: string;
  readonly displayName: string;
  readonly risk: RiskLevel;
  readonly category: Category;
  readonly tool: Tool;
  readonly size: number;
  readonly reason: string;
  readonly execution: ExecutionStrategy;
  readonly group?: string;
  selected: boolean;
}
