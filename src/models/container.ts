import { RiskLevel, Tool, ContainerActionKind } from "./enums.js";
import { ExecutionStrategy } from "./execution.js";

export interface InternalComponent {
  readonly label: string;
  readonly size: number;
  readonly role: "state" | "cache" | "snapshot";
}

export interface ContainerAction {
  readonly name: ContainerActionKind;
  readonly risk: RiskLevel;
  readonly description: string;
  readonly estimatedSize: number;
  readonly execution: ExecutionStrategy;
}

export type ContainerKind = "ios_simulator" | "android_avd";

export interface ContainerCandidate {
  readonly id: string;
  readonly path: string;
  readonly name: string;
  readonly kind: ContainerKind;
  readonly tool: Tool;
  readonly totalSize: number;
  readonly breakdown: readonly InternalComponent[];
  readonly actions: readonly ContainerAction[];
  selectedAction: ContainerActionKind | null;
}
