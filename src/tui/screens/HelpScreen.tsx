import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";
import { Dict } from "../i18n.js";

interface Row {
  key: string;
  desc: string;
}

export function HelpScreen({ d }: { d: Dict }) {
  const groups: { title: string; rows: Row[] }[] = [
    {
      title: d.helpNav,
      rows: [
        { key: "↑↓", desc: d.helpMove },
        { key: "→ / ⏎", desc: d.helpEnter },
        { key: "← / ⌫ / esc", desc: d.helpBack },
        { key: "tab", desc: d.helpFocus },
      ],
    },
    {
      title: d.helpSelection,
      rows: [
        { key: "space", desc: d.helpToggle },
        { key: "a", desc: d.helpToggleAll },
        { key: "1 2 3 0", desc: d.helpContainer },
      ],
    },
    {
      title: d.helpActions,
      rows: [
        { key: "d", desc: d.helpDelete },
        { key: "s", desc: d.helpSummary },
        { key: "/", desc: d.helpSearch },
        { key: "f", desc: d.helpFilter },
        { key: "r", desc: d.helpRescan },
        { key: "l", desc: d.helpLang },
        { key: "?", desc: d.helpHelp },
        { key: "q", desc: d.helpQuit },
      ],
    },
  ];

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.accent} paddingX={2} paddingY={1}>
      <Text bold color={theme.accent}>
        {d.helpTitle}
      </Text>
      {groups.map((g) => (
        <Box key={g.title} flexDirection="column" marginTop={1}>
          <Text color={theme.accent} bold>
            {g.title}
          </Text>
          {g.rows.map((r) => (
            <Box key={r.key}>
              <Text color={theme.green}>{`  ${r.key.padEnd(14)}`}</Text>
              <Text>{r.desc}</Text>
            </Box>
          ))}
        </Box>
      ))}
      <Box marginTop={1}>
        <Text color={theme.dim}>{d.helpClose}</Text>
      </Box>
    </Box>
  );
}
