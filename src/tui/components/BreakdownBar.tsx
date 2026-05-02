import React from "react";
import { Text } from "ink";
import { InternalComponent } from "../../models/container.js";
import { theme } from "../theme.js";

const colorByRole: Record<InternalComponent["role"], string> = {
  state: theme.accent,
  snapshot: theme.yellow,
  cache: theme.green,
};

const FULL = "█";
const EMPTY = "░";

export function BreakdownBar({
  components,
  width = 12,
  max,
}: {
  components: readonly InternalComponent[];
  width?: number;
  max: number;
}) {
  const total = components.reduce((s, c) => s + c.size, 0);
  if (total <= 0 || max <= 0) {
    return <Text color={theme.dim}>{EMPTY.repeat(width)}</Text>;
  }
  const dominant = [...components].sort((a, b) => b.size - a.size)[0];
  const ratio = Math.min(1, total / max);
  const filled = Math.max(1, Math.round(ratio * width));
  const empty = Math.max(0, width - filled);
  return (
    <Text>
      <Text color={dominant ? colorByRole[dominant.role] : theme.accent}>
        {FULL.repeat(filled)}
      </Text>
      <Text color={theme.dim}>{EMPTY.repeat(empty)}</Text>
    </Text>
  );
}
