import React from "react";
import { Text } from "ink";
import { theme } from "../theme.js";

interface Props {
  size: number;
  max: number;
  width?: number;
}

const FULL = "█";
const EMPTY = "░";

export function SizeBar({ size, max, width = 12 }: Props) {
  const ratio = max > 0 ? Math.min(1, size / max) : 0;
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  return (
    <Text color={theme.dim}>
      {FULL.repeat(filled)}
      {EMPTY.repeat(empty)}
    </Text>
  );
}
