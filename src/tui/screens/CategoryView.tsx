import React from "react";
import { Box, Text } from "ink";
import { Category } from "../../models/enums.js";
import { CleanupCandidate } from "../../models/candidate.js";
import { ContainerCandidate } from "../../models/container.js";
import { CandidateRow } from "../components/CandidateRow.js";
import { ContainerRow } from "../components/ContainerRow.js";
import { categoryLabel } from "../categoryLabels.js";
import { theme } from "../theme.js";
import { formatBytes } from "../../services/sizeCalculator.js";
import { Dict } from "../i18n.js";

function translateGroup(key: string | undefined, d: Dict): string {
  if (!key) return "";
  switch (key) {
    case "global_caches":
      return d.groupGlobalCaches;
    case "projects":
      return d.groupProjects;
    case "orphans":
      return d.groupOrphans;
    case "gradle_versions":
      return d.groupGradleVersions;
    case "build_cache":
      return d.groupBuildCache;
    case "jars_transforms":
      return d.groupJarsTransforms;
    case "metadata":
      return d.groupMetadata;
    case "versionados":
      return d.groupVersioned;
    case "binarios":
      return d.groupBinaries;
    case "legacy":
      return d.groupLegacy;
    case "auxiliares":
      return d.groupAux;
    default:
      return key.toUpperCase();
  }
}

interface Props {
  category: Category | null;
  candidates: CleanupCandidate[];
  containers: ContainerCandidate[];
  cursor: number;
  focused: boolean;
  viewport: number;
  d: Dict;
}

export function CategoryView({
  category,
  candidates,
  containers,
  cursor,
  focused,
  viewport,
  d,
}: Props) {
  const isContainerView = containers.length > 0;
  const total =
    candidates.reduce((s, c) => s + c.size, 0) +
    containers.reduce((s, c) => s + c.totalSize, 0);
  const selectedSize =
    candidates.filter((c) => c.selected).reduce((s, c) => s + c.size, 0) +
    containers.reduce((s, c) => {
      if (!c.selectedAction) return s;
      const a = c.actions.find((x) => x.name === c.selectedAction);
      return s + (a?.estimatedSize ?? 0);
    }, 0);
  const selectedItems =
    candidates.filter((c) => c.selected).length +
    containers.filter((c) => c.selectedAction !== null).length;
  const itemCount = candidates.length + containers.length;

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={focused ? theme.accent : theme.border}
      paddingX={1}
      flexGrow={1}
    >
      <Box>
        <Text bold>{category ? categoryLabel(category, d) : d.pickCategory}</Text>
        <Text color={theme.dim}>
          {category ? `  ·  ${itemCount} ${d.items}  ·  ${formatBytes(total)}` : ""}
        </Text>
        {category && selectedItems > 0 ? (
          <Text color={theme.green} bold>
            {"  ·  "}→ {d.toDelete} {formatBytes(selectedSize)} ({selectedItems})
          </Text>
        ) : null}
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {!category ? (
          <Text color={theme.dim}>{d.helpSidebar}</Text>
        ) : isContainerView ? (
          <ContainersList
            containers={containers}
            cursor={cursor}
            focused={focused}
            viewport={viewport}
            d={d}
          />
        ) : candidates.length === 0 ? (
          <Text color={theme.dim}>{d.empty}</Text>
        ) : (
          <CandidatesList
            candidates={candidates}
            cursor={cursor}
            focused={focused}
            viewport={viewport}
            d={d}
          />
        )}
      </Box>

      {focused ? (
        <Box marginTop={1}>
          <Text color={theme.dim}>
            {isContainerView ? d.keysContainers : d.keysCandidates}
          </Text>
        </Box>
      ) : null}
    </Box>
  );
}

function countVisualRows(
  slice: CleanupCandidate[],
  prevGroup: string | undefined,
): number {
  let rows = 0;
  let last = prevGroup;
  for (let i = 0; i < slice.length; i++) {
    const c = slice[i]!;
    if (c.group && c.group !== last) {
      rows += 1;
      if (i > 0) rows += 1;
    }
    rows += 1;
    last = c.group;
  }
  return rows;
}

function CandidatesList({
  candidates,
  cursor,
  focused,
  viewport,
  d,
}: {
  candidates: CleanupCandidate[];
  cursor: number;
  focused: boolean;
  viewport: number;
  d: Dict;
}) {
  const max = candidates.reduce((m, c) => Math.max(m, c.size), 0);
  const SCROLL_OFF = 3;
  const anchorBelow = Math.min(cursor + SCROLL_OFF, candidates.length - 1);
  const start = Math.max(
    Math.max(0, anchorBelow - viewport + 1),
    Math.min(
      Math.max(0, cursor - SCROLL_OFF),
      Math.max(0, candidates.length - viewport),
    ),
  );

  const hasPageIndicator = candidates.length > viewport;
  const targetRows = hasPageIndicator ? viewport - 1 : viewport;

  const prevGroup: string | undefined = start > 0 ? candidates[start - 1]?.group : undefined;
  const visible: CleanupCandidate[] = [];
  for (let idx = start; idx < candidates.length; idx++) {
    const trial = [...visible, candidates[idx]!];
    if (countVisualRows(trial, prevGroup) > targetRows) break;
    visible.push(candidates[idx]!);
  }
  const usedRows = countVisualRows(visible, prevGroup);
  const padRows = Math.max(0, targetRows - usedRows);

  let lastGroup: string | undefined = prevGroup;

  return (
    <Box flexDirection="column">
      {visible.map((c, i) => {
        const showGroup = c.group !== lastGroup;
        lastGroup = c.group;
        return (
          <Box flexDirection="column" key={c.id}>
            {showGroup && c.group ? (
              <Box marginTop={i === 0 ? 0 : 1}>
                <Text color={theme.accent} bold>
                  {translateGroup(c.group, d)}
                </Text>
              </Box>
            ) : null}
            <CandidateRow
              candidate={c}
              active={focused && start + i === cursor}
              maxSize={max}
            />
          </Box>
        );
      })}
      {Array.from({ length: padRows }, (_, i) => (
        <Box key={`pad-${i}`} height={1} />
      ))}
      {/* pagination indicator hidden temporarily */}
    </Box>
  );
}

function ContainersList({
  containers,
  cursor,
  focused,
  viewport,
  d,
}: {
  containers: ContainerCandidate[];
  cursor: number;
  focused: boolean;
  viewport: number;
  d: Dict;
}) {
  const hasPageIndicator = containers.length > viewport;
  const effectiveViewport = hasPageIndicator ? viewport - 1 : viewport;
  const SCROLL_OFF = 3;
  const anchorBelow = Math.min(cursor + SCROLL_OFF, containers.length - 1);
  const start = Math.max(
    Math.max(0, anchorBelow - effectiveViewport + 1),
    Math.min(
      Math.max(0, cursor - SCROLL_OFF),
      Math.max(0, containers.length - effectiveViewport),
    ),
  );
  const visible = containers.slice(start, start + effectiveViewport);
  const padRows = Math.max(0, effectiveViewport - visible.length);
  const maxSize = containers.reduce((m, c) => Math.max(m, c.totalSize), 0);
  return (
    <Box flexDirection="column">
      {visible.map((c, i) => (
        <ContainerRow
          key={c.id}
          container={c}
          active={focused && start + i === cursor}
          d={d}
          maxSize={maxSize}
        />
      ))}
      {Array.from({ length: padRows }, (_, i) => (
        <Box key={`pad-${i}`} height={1} />
      ))}
      {/* pagination indicator hidden temporarily */}
    </Box>
  );
}
