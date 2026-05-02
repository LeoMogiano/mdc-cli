import React from "react";
import { Text } from "ink";
import { RiskLevel } from "../../models/enums.js";
import { theme } from "../theme.js";

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  const color = risk === RiskLevel.Green ? theme.green : theme.yellow;
  return <Text color={color}>●</Text>;
}
