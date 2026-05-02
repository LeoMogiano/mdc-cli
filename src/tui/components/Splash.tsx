import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";
import { Dict } from "../i18n.js";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

// figlet "ANSI Shadow" — MOBILE / CLEANER
const LOGO = [
  "███╗   ███╗ ██████╗ ██████╗ ██╗██╗     ███████╗",
  "████╗ ████║██╔═══██╗██╔══██╗██║██║     ██╔════╝",
  "██╔████╔██║██║   ██║██████╔╝██║██║     █████╗  ",
  "██║╚██╔╝██║██║   ██║██╔══██╗██║██║     ██╔══╝  ",
  "██║ ╚═╝ ██║╚██████╔╝██████╔╝██║███████╗███████╗",
  "╚═╝     ╚═╝ ╚═════╝ ╚═════╝ ╚═╝╚══════╝╚══════╝",
  " ██████╗██╗     ███████╗ █████╗ ███╗   ██╗███████╗██████╗ ",
  "██╔════╝██║     ██╔════╝██╔══██╗████╗  ██║██╔════╝██╔══██╗",
  "██║     ██║     █████╗  ███████║██╔██╗ ██║█████╗  ██████╔╝",
  "██║     ██║     ██╔══╝  ██╔══██║██║╚██╗██║██╔══╝  ██╔══██╗",
  "╚██████╗███████╗███████╗██║  ██║██║ ╚████║███████╗██║  ██║",
  " ╚═════╝╚══════╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝",
];

interface Props {
  d: Dict;
  version: string;
}

export function Splash({ d, version }: Props) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), 80);
    return () => clearInterval(id);
  }, []);
  const lines = LOGO;
  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" paddingY={2}>
      {lines.map((line, i) => (
        <Box key={i}>
          <Text color={theme.accent}>{line}</Text>
        </Box>
      ))}
      <Box marginTop={1}>
        <Text color={theme.accent} bold>
          Dev Mobile Cleaner
        </Text>
        <Text color={theme.dim}> v{version}</Text>
      </Box>
      <Box>
        <Text color={theme.dim}>by </Text>
        <Text color={theme.accent}>@LeoMogiano</Text>
        <Text color={theme.dim}>  ·  github.com/LeoMogiano</Text>
      </Box>
      <Box marginTop={2}>
        <Text color={theme.green}>{FRAMES[frame]} </Text>
        <Text color={theme.dim}>{d.scanning}</Text>
      </Box>
    </Box>
  );
}
