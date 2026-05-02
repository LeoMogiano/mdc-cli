import { create } from "zustand";
import { ScanResult, ToolReport } from "../models/scan.js";
import { Category, ContainerActionKind, Tool } from "../models/enums.js";
import { Lang } from "../tui/i18n.js";

export type ScanStatus = "idle" | "scanning" | "ready" | "error";
export type Focus = "sidebar" | "list";
export type RiskFilter = "all" | "green" | "yellow";

interface AppState {
  status: ScanStatus;
  error: string | null;
  result: ScanResult;
  cursor: number;
  sidebarCursor: number;
  selectedCategory: Category | null;
  focus: Focus;
  lang: Lang;
  riskFilter: RiskFilter;
  search: string;
  searchOpen: boolean;
  setStatus(status: ScanStatus, error?: string | null): void;
  setReport(report: ToolReport): void;
  toggleSelection(candidateId: string): void;
  toggleAllInCategory(category: Category): void;
  setContainerAction(containerId: string, action: ContainerActionKind | null): void;
  toggleAllContainers(category: Category): void;
  setCursor(idx: number): void;
  setSidebarCursor(idx: number): void;
  setSelectedCategory(c: Category | null): void;
  setFocus(f: Focus): void;
  setLang(l: Lang): void;
  setRiskFilter(f: RiskFilter): void;
  setSearch(q: string): void;
  setSearchOpen(open: boolean): void;
  resetResult(): void;
}

function emptyResult(): ScanResult {
  return { scannedAt: new Date().toISOString(), reports: {} };
}

export const useAppStore = create<AppState>((set) => ({
  status: "idle",
  error: null,
  result: emptyResult(),
  cursor: 0,
  sidebarCursor: 0,
  selectedCategory: null,
  focus: "sidebar",
  lang: "en",
  riskFilter: "all",
  search: "",
  searchOpen: false,
  setStatus: (status, error = null) => set({ status, error }),
  setReport: (report) =>
    set((s) => ({
      result: {
        scannedAt: new Date().toISOString(),
        reports: { ...s.result.reports, [report.tool]: report },
      },
    })),
  toggleSelection: (candidateId) =>
    set((s) => {
      const reports = { ...s.result.reports };
      for (const tool of Object.keys(reports) as Tool[]) {
        const r = reports[tool];
        if (!r) continue;
        const candidates = r.candidates.map((c) =>
          c.id === candidateId ? { ...c, selected: !c.selected } : c,
        );
        reports[tool] = { ...r, candidates };
      }
      return { result: { ...s.result, reports } };
    }),
  toggleAllInCategory: (category) =>
    set((s) => {
      const reports = { ...s.result.reports };
      let allSelected = true;
      let any = false;
      for (const tool of Object.keys(reports) as Tool[]) {
        const r = reports[tool];
        if (!r) continue;
        for (const c of r.candidates) {
          if (c.category !== category) continue;
          any = true;
          if (!c.selected) {
            allSelected = false;
            break;
          }
        }
        if (!allSelected) break;
      }
      if (!any) return s;
      const target = !allSelected;
      for (const tool of Object.keys(reports) as Tool[]) {
        const r = reports[tool];
        if (!r) continue;
        const candidates = r.candidates.map((c) =>
          c.category === category ? { ...c, selected: target } : c,
        );
        reports[tool] = { ...r, candidates };
      }
      return { result: { ...s.result, reports } };
    }),
  setContainerAction: (containerId, action) =>
    set((s) => {
      const reports = { ...s.result.reports };
      for (const tool of Object.keys(reports) as Tool[]) {
        const r = reports[tool];
        if (!r) continue;
        const containers = r.containers.map((c) =>
          c.id === containerId ? { ...c, selectedAction: action } : c,
        );
        reports[tool] = { ...r, containers };
      }
      return { result: { ...s.result, reports } };
    }),
  toggleAllContainers: (category) =>
    set((s) => {
      const targetKind =
        category === Category.IosSimulators
          ? "ios_simulator"
          : category === Category.AndroidAvds
            ? "android_avd"
            : null;
      if (!targetKind) return s;
      const reports = { ...s.result.reports };
      let allSet = true;
      let any = false;
      for (const tool of Object.keys(reports) as Tool[]) {
        const r = reports[tool];
        if (!r) continue;
        for (const c of r.containers) {
          if (c.kind !== targetKind) continue;
          any = true;
          if (c.selectedAction === null) {
            allSet = false;
            break;
          }
        }
        if (!allSet) break;
      }
      if (!any) return s;
      const next: ContainerActionKind | null = allSet ? null : "soft_clean";
      for (const tool of Object.keys(reports) as Tool[]) {
        const r = reports[tool];
        if (!r) continue;
        const containers = r.containers.map((c) =>
          c.kind === targetKind ? { ...c, selectedAction: next } : c,
        );
        reports[tool] = { ...r, containers };
      }
      return { result: { ...s.result, reports } };
    }),
  setLang: (l) => set({ lang: l }),
  setRiskFilter: (f) => set({ riskFilter: f, cursor: 0 }),
  setSearch: (q) => set({ search: q, cursor: 0 }),
  setSearchOpen: (open) => set({ searchOpen: open, search: open ? "" : "" }),
  setCursor: (idx) => set({ cursor: idx }),
  setSidebarCursor: (idx) => set({ sidebarCursor: idx }),
  setSelectedCategory: (c) => set({ selectedCategory: c, cursor: 0 }),
  setFocus: (f) => set({ focus: f }),
  resetResult: () => set({ result: emptyResult(), cursor: 0, sidebarCursor: 0 }),
}));
