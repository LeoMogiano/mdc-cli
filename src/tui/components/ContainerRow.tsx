import React from "react";
import { Box, Text } from "ink";
import { ContainerCandidate } from "../../models/container.js";
import { BreakdownBar } from "./BreakdownBar.js";
import { formatBytes } from "../../services/sizeCalculator.js";
import { theme } from "../theme.js";
import { Dict } from "../i18n.js";

interface Props {
  container: ContainerCandidate;
  active: boolean;
  d: Dict;
  maxSize: number;
}

export function ContainerRow({ container, active, d, maxSize }: Props) {
  const tag = (() => {
    switch (container.selectedAction) {
      case "soft_clean":
        return { label: `[1 ${d.actSoftClean}]`, color: theme.green };
      case "reset":
        return { label: `[2 ${d.actReset}]`, color: theme.yellow };
      case "delete":
        return { label: `[3 ${d.actDelete}]`, color: theme.yellow };
      default:
        return null;
    }
  })();
  const size = formatBytes(container.totalSize).padStart(9);
  const name = container.name.padEnd(38).slice(0, 38);

  return (
    <Box>
      <Text {...(active ? { color: theme.accent, inverse: true } : {})}>
        {active ? "›" : " "} <Text>{name}</Text>{" "}
        <BreakdownBar components={container.breakdown} width={12} max={maxSize} />{" "}
        <Text color={theme.dim}>{size}</Text>{" "}
        {tag ? (
          <Text color={tag.color}>{tag.label}</Text>
        ) : (
          <Text color={theme.dim}>{d.none}</Text>
        )}
      </Text>
    </Box>
  );
}
