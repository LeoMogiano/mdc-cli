import React from "react";
import { Box, Text } from "ink";
import { CleanupRunResult } from "../../cleaner.js";
import { formatBytes } from "../../services/sizeCalculator.js";
import { theme } from "../theme.js";
import { Dict } from "../i18n.js";

interface Props {
  result: CleanupRunResult;
  d: Dict;
}

export function ResultScreen({ result, d }: Props) {
  const { totalFreed, totalErrors, results } = result;
  const ok = results.length - totalErrors;
  const errors = results.filter((r) => !r.ok);

  return (
    <Box flexDirection="column" borderStyle="double" borderColor={theme.green} paddingX={2} paddingY={1}>
      <Text bold color={theme.green}>
        {d.resultTitle}
      </Text>
      <Box marginTop={1}>
        <Text>
          {d.resultFreed} <Text bold color={theme.green}>{formatBytes(totalFreed)}</Text>
        </Text>
      </Box>
      <Box>
        <Text color={theme.dim}>
          {ok} {d.resultOk} · {totalErrors} {d.resultErrors}
        </Text>
      </Box>
      {errors.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.error} bold>
            {d.resultErrorsHeader}
          </Text>
          {errors.slice(0, 10).map((r, i) => (
            <Text key={i} color={theme.error}>
              {"  "}✗ {r.item.label}: {r.error}
            </Text>
          ))}
          {errors.length > 10 ? (
            <Text color={theme.dim}>{"  "}… +{errors.length - 10} más</Text>
          ) : null}
        </Box>
      ) : null}
      <Box marginTop={1}>
        <Text color={theme.dim}>{d.resultHint}</Text>
      </Box>
    </Box>
  );
}
