import { ExecutionKind, ContainerActionKind } from "./enums.js";

export interface ExecutionStrategy {
  readonly kind: ExecutionKind;
  readonly path?: string;
  readonly executable?: string;
  readonly args?: readonly string[];
  readonly containerAction?: ContainerActionKind;
}
