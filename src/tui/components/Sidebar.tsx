import React from "react";
import { Box, Text } from "ink";
import { Category, Tool } from "../../models/enums.js";
import { ScanResult } from "../../models/scan.js";
import {
  categoryLabel,
  xcodeCategoriesOrder,
  androidCategoriesOrder,
  toolLabel,
} from "../categoryLabels.js";
import { theme } from "../theme.js";
import { formatBytes } from "../../services/sizeCalculator.js";
import { Dict } from "../i18n.js";

export interface SidebarRow {
  kind: "category";
  tool: Tool;
  category: Category;
  size: number;
  count: number;
  selectedSize: number;
  selectedCount: number;
}

export interface ToolHeaderRow {
  kind: "header";
  tool: Tool;
  installed: boolean;
}

export type SidebarItem = SidebarRow | ToolHeaderRow;

export function buildSidebarItems(result: ScanResult): SidebarItem[] {
  const items: SidebarItem[] = [];
  for (const tool of [Tool.Xcode, Tool.Android] as const) {
    const order = tool === Tool.Xcode ? xcodeCategoriesOrder : androidCategoriesOrder;
    const report = result.reports[tool];
    items.push({ kind: "header", tool, installed: !!report });
    if (!report) continue;
    type Agg = { size: number; count: number; selectedSize: number; selectedCount: number };
    const sizes = new Map<Category, Agg>();
    for (const c of report.candidates) {
      const prev =
        sizes.get(c.category) ?? { size: 0, count: 0, selectedSize: 0, selectedCount: 0 };
      sizes.set(c.category, {
        size: prev.size + c.size,
        count: prev.count + 1,
        selectedSize: prev.selectedSize + (c.selected ? c.size : 0),
        selectedCount: prev.selectedCount + (c.selected ? 1 : 0),
      });
    }
    if (report.containers.length > 0) {
      const cat =
        tool === Tool.Xcode ? Category.IosSimulators : Category.AndroidAvds;
      const totalSize = report.containers.reduce((s, c) => s + c.totalSize, 0);
      const selSize = report.containers.reduce((s, c) => {
        if (!c.selectedAction) return s;
        const a = c.actions.find((x) => x.name === c.selectedAction);
        return s + (a?.estimatedSize ?? 0);
      }, 0);
      const selCount = report.containers.filter((c) => c.selectedAction !== null).length;
      const prev =
        sizes.get(cat) ?? { size: 0, count: 0, selectedSize: 0, selectedCount: 0 };
      sizes.set(cat, {
        size: prev.size + totalSize,
        count: prev.count + report.containers.length,
        selectedSize: prev.selectedSize + selSize,
        selectedCount: prev.selectedCount + selCount,
      });
    }
    for (const cat of order) {
      const agg = sizes.get(cat);
      if (!agg || agg.size === 0) continue;
      items.push({
        kind: "category",
        tool,
        category: cat,
        size: agg.size,
        count: agg.count,
        selectedSize: agg.selectedSize,
        selectedCount: agg.selectedCount,
      });
    }
  }
  return items;
}

interface Props {
  items: SidebarItem[];
  cursor: number;
  focused: boolean;
  selectedCategory: Category | null;
  d: Dict;
}

export function Sidebar({ items, cursor, focused, selectedCategory, d }: Props) {
  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={focused ? theme.accent : theme.border}
      paddingX={1}
      width={54}
    >
      <Text color={theme.dim}>{d.categories}</Text>
      {items.map((item, i) => {
        const active = focused && i === cursor;
        if (item.kind === "header") {
          return (
            <Box key={`h:${item.tool}`} marginTop={1}>
              <Text color={item.installed ? theme.accent : theme.dim} bold>
                {toolLabel(item.tool, d)}
                {!item.installed ? ` ${d.notDetected}` : ""}
              </Text>
            </Box>
          );
        }
        const isSelected = selectedCategory === item.category;
        const has = item.selectedCount > 0;
        const counts = `${item.selectedCount}/${item.count}`.padStart(7);
        const size = (has
          ? formatBytes(item.selectedSize)
          : formatBytes(item.size)
        ).padStart(10);
        return (
          <Box key={`c:${item.tool}:${item.category}`}>
            <Text {...(active ? { color: theme.accent, inverse: true } : {})}>
              {active ? "›" : " "}{" "}
              <Text {...(isSelected ? { color: theme.accent } : {})}>
                {categoryLabel(item.category, d).padEnd(28).slice(0, 28)}
              </Text>
              <Text color={theme.dim}>{counts}  </Text>
              {has ? (
                <Text color={theme.green} bold>
                  {size}
                </Text>
              ) : (
                <Text color={theme.dim}>{size}</Text>
              )}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
