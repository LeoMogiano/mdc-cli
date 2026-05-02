import React from "react";
import { Box, Text } from "ink";
import { CleanupCandidate } from "../../models/candidate.js";
import { ContainerCandidate } from "../../models/container.js";
import { Category, Tool, RiskLevel } from "../../models/enums.js";
import { categoryLabel, toolLabel } from "../categoryLabels.js";
import { formatBytes } from "../../services/sizeCalculator.js";
import { theme } from "../theme.js";
import { Dict } from "../i18n.js";
import { RiskBadge } from "../components/RiskBadge.js";

interface Props {
  candidates: CleanupCandidate[];
  containers: ContainerCandidate[];
  d: Dict;
}

interface Row {
  tool: Tool;
  category: Category;
  label: string;
  size: number;
  risk: RiskLevel;
}

function buildRows(candidates: CleanupCandidate[], containers: ContainerCandidate[]): Row[] {
  const rows: Row[] = [];
  for (const c of candidates) {
    if (!c.selected) continue;
    rows.push({
      tool: c.tool,
      category: c.category,
      label: c.displayName,
      size: c.size,
      risk: c.risk,
    });
  }
  for (const c of containers) {
    if (!c.selectedAction) continue;
    const a = c.actions.find((x) => x.name === c.selectedAction);
    if (!a) continue;
    const cat = c.kind === "ios_simulator" ? Category.IosSimulators : Category.AndroidAvds;
    rows.push({
      tool: c.tool,
      category: cat,
      label: `${c.name} [${c.selectedAction}]`,
      size: a.estimatedSize,
      risk: a.risk,
    });
  }
  return rows;
}

export function SummaryScreen({ candidates, containers, d }: Props) {
  const rows = buildRows(candidates, containers);
  const total = rows.reduce((s, r) => s + r.size, 0);

  // Group by tool > category.
  const byTool = new Map<Tool, Map<Category, Row[]>>();
  for (const r of rows) {
    if (!byTool.has(r.tool)) byTool.set(r.tool, new Map());
    const cm = byTool.get(r.tool)!;
    if (!cm.has(r.category)) cm.set(r.category, []);
    cm.get(r.category)!.push(r);
  }

  return (
    <Box flexDirection="column" borderStyle="double" borderColor={theme.green} paddingX={2} paddingY={1}>
      <Box>
        <Text bold color={theme.green}>
          {d.summaryTitle}
        </Text>
      </Box>

      {rows.length === 0 ? (
        <Box marginTop={1}>
          <Text color={theme.dim}>{d.summaryEmpty}</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {[...byTool.entries()].map(([tool, cm]) => (
            <Box key={tool} flexDirection="column" marginBottom={1}>
              <Text color={theme.accent} bold>
                {toolLabel(tool, d)}
              </Text>
              {[...cm.entries()].map(([cat, items]) => {
                const catTotal = items.reduce((s, r) => s + r.size, 0);
                return (
                  <Box key={cat} flexDirection="column">
                    <Box>
                      <Text>
                        {"  "}
                        {categoryLabel(cat, d).padEnd(28)}
                        <Text color={theme.dim}> ({items.length}) </Text>
                        <Text bold>{formatBytes(catTotal).padStart(10)}</Text>
                      </Text>
                    </Box>
                    {items.map((r, i) => (
                      <Box key={i}>
                        <Text color={theme.dim}>
                          {"      "}
                          <RiskBadge risk={r.risk} /> {r.label.padEnd(36).slice(0, 36)}
                          {formatBytes(r.size).padStart(10)}
                        </Text>
                      </Box>
                    ))}
                  </Box>
                );
              })}
            </Box>
          ))}
        </Box>
      )}

      <Box marginTop={1} borderStyle="single" borderColor={theme.green} paddingX={1}>
        <Text color={theme.green} bold>
          {d.summaryTotal} {formatBytes(total)} ({rows.length} {d.items})
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text color={theme.dim}>{d.summaryHint}</Text>
      </Box>
    </Box>
  );
}
