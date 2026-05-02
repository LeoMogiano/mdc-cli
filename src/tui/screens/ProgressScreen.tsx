import React from "react";
import { Box, Text } from "ink";
import { CleanupOpResult } from "../../cleaner.js";
import { formatBytes } from "../../services/sizeCalculator.js";
import { theme } from "../theme.js";
import { Dict } from "../i18n.js";

interface Props {
  results: CleanupOpResult[];
  total: number;
  done: number;
  freed: number;
  d: Dict;
}

export function ProgressScreen({ results, total, done, freed, d }: Props) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const barWidth = 30;
  const filled = Math.round((done / Math.max(1, total)) * barWidth);
  const empty = barWidth - filled;
  const tail = results.slice(-10);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.accent} paddingX={2} paddingY={1}>
      <Text bold color={theme.accent}>
        {d.progressTitle}
      </Text>
      <Box marginTop={1}>
        <Text color={theme.green}>{"█".repeat(filled)}</Text>
        <Text color={theme.dim}>{"░".repeat(empty)}</Text>
        <Text>
          {" "}
          {done}/{total} ({pct}%) · {formatBytes(freed)} {d.progressFreed}
        </Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {tail.map((r, i) => (
          <Box key={i}>
            <Text color={r.ok ? theme.green : theme.error}>
              {r.ok ? "✓" : "✗"} {r.item.label.padEnd(50).slice(0, 50)}
            </Text>
            <Text color={theme.dim}>
              {" "}
              {formatBytes(r.freed).padStart(10)}
              {r.error ? ` · ${r.error.slice(0, 40)}` : ""}
            </Text>
          </Box>
        ))}
      </Box>

      <Box marginTop={1}>
        <Text color={theme.dim}>{d.progressHint}</Text>
      </Box>
    </Box>
  );
}
