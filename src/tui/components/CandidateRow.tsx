import React from "react";
import { Box, Text } from "ink";
import { CleanupCandidate } from "../../models/candidate.js";
import { RiskBadge } from "./RiskBadge.js";
import { SizeBar } from "./SizeBar.js";
import { formatBytes } from "../../services/sizeCalculator.js";
import { symbols, theme } from "../theme.js";

interface Props {
  candidate: CleanupCandidate;
  active: boolean;
  maxSize: number;
}

export function CandidateRow({ candidate, active, maxSize }: Props) {
  const checkbox = candidate.selected ? symbols.checked : symbols.unchecked;
  const size = formatBytes(candidate.size).padStart(10);
  return (
    <Box>
      <Text {...(active ? { color: theme.accent, inverse: true } : {})}>
        {active ? "›" : " "} {checkbox} <RiskBadge risk={candidate.risk} />{" "}
        <Text>{candidate.displayName.padEnd(40).slice(0, 40)}</Text>{" "}
        <SizeBar size={candidate.size} max={maxSize} width={12} />{" "}
        <Text color={theme.dim}>{size}</Text>
      </Text>
    </Box>
  );
}
