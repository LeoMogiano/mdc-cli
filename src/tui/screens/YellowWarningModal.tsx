import React from "react";
import { Box, Text } from "ink";
import { CleanupCandidate } from "../../models/candidate.js";
import { ContainerCandidate } from "../../models/container.js";
import { RiskLevel } from "../../models/enums.js";
import { formatBytes } from "../../services/sizeCalculator.js";
import { theme } from "../theme.js";
import { Dict } from "../i18n.js";

interface Props {
  candidates: CleanupCandidate[];
  containers: ContainerCandidate[];
  d: Dict;
}

interface YellowRow {
  label: string;
  size: number;
  reason: string;
}

function buildYellow(
  candidates: CleanupCandidate[],
  containers: ContainerCandidate[],
): YellowRow[] {
  const out: YellowRow[] = [];
  for (const c of candidates) {
    if (!c.selected || c.risk !== RiskLevel.Yellow) continue;
    out.push({ label: c.displayName, size: c.size, reason: c.reason });
  }
  for (const c of containers) {
    if (!c.selectedAction) continue;
    const a = c.actions.find((x) => x.name === c.selectedAction);
    if (!a || a.risk !== RiskLevel.Yellow) continue;
    out.push({
      label: `${c.name} [${c.selectedAction}]`,
      size: a.estimatedSize,
      reason: a.description,
    });
  }
  return out;
}

export function YellowWarningModal({ candidates, containers, d }: Props) {
  const rows = buildYellow(candidates, containers);
  const total = rows.reduce((s, r) => s + r.size, 0);

  return (
    <Box flexDirection="column" borderStyle="double" borderColor={theme.yellow} paddingX={2} paddingY={1}>
      <Text bold color={theme.yellow}>
        ⚠  {d.yellowWarnTitle}
      </Text>
      <Box marginTop={1}>
        <Text>
          {d.yellowWarnIntro}{" "}
          <Text bold color={theme.yellow}>
            {rows.length}
          </Text>{" "}
          {d.items}{" · "}
          <Text bold color={theme.yellow}>
            {formatBytes(total)}
          </Text>
        </Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {rows.slice(0, 12).map((r, i) => (
          <Box key={i}>
            <Text color={theme.yellow}>● </Text>
            <Text>{r.label.padEnd(40).slice(0, 40)}</Text>
            <Text color={theme.dim}>
              {" "}
              {formatBytes(r.size).padStart(10)} · {r.reason.slice(0, 50)}
            </Text>
          </Box>
        ))}
        {rows.length > 12 ? (
          <Text color={theme.dim}>… +{rows.length - 12} más</Text>
        ) : null}
      </Box>

      <Box marginTop={1}>
        <Text color={theme.dim}>{d.yellowWarnExplain}</Text>
      </Box>

      <Box marginTop={1} borderStyle="single" borderColor={theme.yellow} paddingX={1}>
        <Text color={theme.yellow} bold>
          {d.yellowWarnHint}
        </Text>
      </Box>
    </Box>
  );
}
