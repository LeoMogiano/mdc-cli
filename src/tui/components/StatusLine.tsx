import React from "react";
import { Box, Text } from "ink";
import { formatBytes } from "../../services/sizeCalculator.js";
import { theme } from "../theme.js";
import { ScanStatus } from "../../store/appStore.js";
import { Dict, Lang } from "../i18n.js";

interface Props {
  status: ScanStatus;
  totalCandidates: number;
  totalSize: number;
  selectedCount: number;
  selectedSize: number;
  error: string | null;
  d: Dict;
  lang: Lang;
}

export function StatusLine({
  status,
  totalCandidates,
  totalSize,
  selectedCount,
  selectedSize,
  error,
  d,
  lang,
}: Props) {
  const has = selectedCount > 0;
  return (
    <Box borderStyle="single" borderColor={has ? theme.green : theme.border} paddingX={1}>
      <Box flexDirection="column" width="100%">
        <Box>
          <Text color={theme.accent}>{d.status} </Text>
          <Text>{status}</Text>
          <Text color={theme.dim}>  ·  lang </Text>
          <Text>{lang}</Text>
          {error ? <Text color={theme.error}> · {error}</Text> : null}
        </Box>
        <Box>
          <Text color={theme.dim}>{d.items} </Text>
          <Text>{totalCandidates}</Text>
          <Text color={theme.dim}>  ·  {d.total} </Text>
          <Text>{formatBytes(totalSize)}</Text>
        </Box>
        <Box>
          {has ? (
            <Text color={theme.green} bold>
              → {d.toDelete} {formatBytes(selectedSize)} ({selectedCount} {d.items})
            </Text>
          ) : (
            <Text color={theme.dim}>
              {d.selected} 0 (0 B)
            </Text>
          )}
        </Box>
        <Box>
          <Text color={theme.dim}>{d.footer}</Text>
        </Box>
      </Box>
    </Box>
  );
}
