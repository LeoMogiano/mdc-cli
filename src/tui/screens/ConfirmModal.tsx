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
import { RunningProcesses } from "../../services/processProbe.js";

interface Props {
  candidates: CleanupCandidate[];
  containers: ContainerCandidate[];
  d: Dict;
  running: RunningProcesses | null;
}

export function buildIdeWarnings(
  candidates: CleanupCandidate[],
  containers: ContainerCandidate[],
  running: RunningProcesses | null,
): string[] {
  if (!running) return [];
  const warnings: string[] = [];
  const hasXcode = candidates.some((c) => c.selected && c.tool === Tool.Xcode);
  const hasSim = containers.some(
    (c) => c.selectedAction !== null && c.kind === "ios_simulator",
  );
  const hasAndroid = candidates.some(
    (c) => c.selected && c.tool === Tool.Android,
  );
  const hasAvd = containers.some(
    (c) => c.selectedAction !== null && c.kind === "android_avd",
  );

  if (running.xcode && hasXcode) warnings.push("Xcode está abierto");
  if (running.simulators && (hasSim || hasXcode))
    warnings.push("Simulator.app está corriendo");
  if (running.androidStudio && (hasAndroid || hasAvd))
    warnings.push("Android Studio está abierto");

  // Block delete on running AVD
  for (const c of containers) {
    if (c.kind !== "android_avd" || c.selectedAction !== "delete") continue;
    const avdName = c.name.split(" · ")[0];
    if (avdName && running.avdEmulators.includes(avdName)) {
      warnings.push(`AVD "${avdName}" está corriendo — no se puede eliminar`);
    }
  }
  return warnings;
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

export function ConfirmModal({ candidates, containers, d, running }: Props) {
  const rows = buildRows(candidates, containers);
  const total = rows.reduce((s, r) => s + r.size, 0);
  const yellowCount = rows.filter((r) => r.risk === RiskLevel.Yellow).length;
  const ideWarnings = buildIdeWarnings(candidates, containers, running);

  const byTool = new Map<Tool, Row[]>();
  for (const r of rows) {
    if (!byTool.has(r.tool)) byTool.set(r.tool, []);
    byTool.get(r.tool)!.push(r);
  }

  return (
    <Box flexDirection="column" borderStyle="double" borderColor={theme.error} paddingX={2} paddingY={1}>
      <Box>
        <Text bold color={theme.error}>
          {d.confirmTitle}
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text>
          {d.confirmIntro} <Text bold color={theme.green}>{formatBytes(total)}</Text>{" "}
          ({rows.length} {d.items})
        </Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {[...byTool.entries()].map(([tool, items]) => {
          const subTotal = items.reduce((s, r) => s + r.size, 0);
          return (
            <Box key={tool} flexDirection="column" marginBottom={1}>
              <Text color={theme.accent} bold>
                {toolLabel(tool, d)} · {formatBytes(subTotal)}
              </Text>
              {items.slice(0, 8).map((r, i) => (
                <Box key={i}>
                  <Text color={theme.dim}>
                    {"  "}
                    <RiskBadge risk={r.risk} />{" "}
                    {categoryLabel(r.category, d).padEnd(22).slice(0, 22)}{" "}
                    {r.label.padEnd(38).slice(0, 38)}{" "}
                    {formatBytes(r.size).padStart(10)}
                  </Text>
                </Box>
              ))}
              {items.length > 8 ? (
                <Text color={theme.dim}>{"  "}… +{items.length - 8} más</Text>
              ) : null}
            </Box>
          );
        })}
      </Box>

      {yellowCount > 0 ? (
        <Box marginTop={1}>
          <Text color={theme.yellow}>
            ⚠ {yellowCount} {d.confirmYellowWarn}
          </Text>
        </Box>
      ) : null}

      {ideWarnings.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.error} bold>
            {d.confirmBlockedTitle}
          </Text>
          {ideWarnings.map((w, i) => (
            <Text key={i} color={theme.error}>
              {"  "}✗ {w}
            </Text>
          ))}
          <Text color={theme.dim}>{d.confirmBlockedHelp}</Text>
        </Box>
      ) : null}

      <Box marginTop={1} borderStyle="single" borderColor={ideWarnings.length > 0 ? theme.dim : theme.error} paddingX={1}>
        <Text color={ideWarnings.length > 0 ? theme.dim : theme.error} bold>
          {ideWarnings.length > 0 ? d.confirmBlockedHint : d.confirmHint}
        </Text>
      </Box>
    </Box>
  );
}
