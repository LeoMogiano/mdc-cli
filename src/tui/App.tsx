import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import { useAppStore } from "../store/appStore.js";
import { XcodeScanner } from "../scanners/xcode.js";
import { AndroidScanner } from "../scanners/android.js";
import { StatusLine } from "./components/StatusLine.js";
import { Sidebar, buildSidebarItems, SidebarItem } from "./components/Sidebar.js";
import { CategoryView } from "./screens/CategoryView.js";
import { SummaryScreen } from "./screens/SummaryScreen.js";
import { Splash } from "./components/Splash.js";
import { SizeCalculator } from "../services/sizeCalculator.js";
import { PersistentSizeCache } from "../services/persistentCache.js";
import { loadConfig, saveConfig } from "../services/config.js";
import { HelpScreen } from "./screens/HelpScreen.js";
import { ConfirmModal, buildIdeWarnings } from "./screens/ConfirmModal.js";
import { YellowWarningModal } from "./screens/YellowWarningModal.js";
import { ProgressScreen } from "./screens/ProgressScreen.js";
import { ResultScreen } from "./screens/ResultScreen.js";
import { Cleaner, CleanupOpResult, CleanupRunResult } from "../cleaner.js";
import { ProcessProbe, RunningProcesses } from "../services/processProbe.js";
import { getVersion } from "../version.js";
import { theme } from "./theme.js";
import { Category, RiskLevel, Tool } from "../models/enums.js";
import { CleanupCandidate } from "../models/candidate.js";
import { ContainerCandidate } from "../models/container.js";
import { dict, nextLang } from "./i18n.js";

// Reserved rows for header + status line + footer + borders.
const RESERVED_ROWS = 14;
const MIN_VIEWPORT = 4;
const MAX_VIEWPORT = 24;

export function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const rows = stdout.rows ?? 30;
  const viewport = Math.max(MIN_VIEWPORT, Math.min(MAX_VIEWPORT, rows - RESERVED_ROWS));
  const status = useAppStore((s) => s.status);
  const error = useAppStore((s) => s.error);
  const result = useAppStore((s) => s.result);
  const cursor = useAppStore((s) => s.cursor);
  const sidebarCursor = useAppStore((s) => s.sidebarCursor);
  const selectedCategory = useAppStore((s) => s.selectedCategory);
  const focus = useAppStore((s) => s.focus);
  const setStatus = useAppStore((s) => s.setStatus);
  const setReport = useAppStore((s) => s.setReport);
  const toggle = useAppStore((s) => s.toggleSelection);
  const toggleAll = useAppStore((s) => s.toggleAllInCategory);
  const toggleAllContainers = useAppStore((s) => s.toggleAllContainers);
  const setContainerAction = useAppStore((s) => s.setContainerAction);
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);
  const riskFilter = useAppStore((s) => s.riskFilter);
  const setRiskFilter = useAppStore((s) => s.setRiskFilter);
  const search = useAppStore((s) => s.search);
  const setSearch = useAppStore((s) => s.setSearch);
  const searchOpen = useAppStore((s) => s.searchOpen);
  const setSearchOpen = useAppStore((s) => s.setSearchOpen);
  const setCursor = useAppStore((s) => s.setCursor);
  const setSidebarCursor = useAppStore((s) => s.setSidebarCursor);
  const setSelectedCategory = useAppStore((s) => s.setSelectedCategory);
  const setFocus = useAppStore((s) => s.setFocus);
  const reset = useAppStore((s) => s.resetResult);

  const sidebarItems: SidebarItem[] = useMemo(() => buildSidebarItems(result), [result]);
  const d = dict(lang);
  const version = getVersion();
  const [showSummary, setShowSummary] = useState(false);
  const [phase, setPhase] = useState<
    "browse" | "confirming" | "yellowWarn" | "cleaning" | "result"
  >("browse");
  const [progressResults, setProgressResults] = useState<CleanupOpResult[]>([]);
  const [progressFreed, setProgressFreed] = useState(0);
  const [runResult, setRunResult] = useState<CleanupRunResult | null>(null);
  const cleanerRef = React.useRef<Cleaner | null>(null);
  const persistentCacheRef = React.useRef<PersistentSizeCache>(new PersistentSizeCache());
  const sizeCalcRef = React.useRef<SizeCalculator | null>(null);
  const [splashElapsed, setSplashElapsed] = useState(false);
  const [running, setRunning] = useState<RunningProcesses | null>(null);
  const [permissionsBlocked, setPermissionsBlocked] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const SPLASH_MIN_MS = 1500;

  useEffect(() => {
    if (selectedCategory) return;
    const firstCat = sidebarItems.find((it) => it.kind === "category");
    if (firstCat && firstCat.kind === "category") {
      setSelectedCategory(firstCat.category);
      const idx = sidebarItems.indexOf(firstCat);
      setSidebarCursor(idx);
    }
  }, [sidebarItems, selectedCategory, setSelectedCategory, setSidebarCursor]);

  const allCandidates: CleanupCandidate[] = useMemo(() => {
    const out: CleanupCandidate[] = [];
    for (const r of Object.values(result.reports)) if (r) out.push(...r.candidates);
    return out;
  }, [result]);

  const allContainers: ContainerCandidate[] = useMemo(() => {
    const out: ContainerCandidate[] = [];
    for (const r of Object.values(result.reports)) if (r) out.push(...r.containers);
    return out;
  }, [result]);

  const totalToDelete =
    allCandidates.filter((c) => c.selected).length +
    allContainers.filter((c) => c.selectedAction !== null).length;

  const hasYellow =
    allCandidates.some((c) => c.selected && c.risk === RiskLevel.Yellow) ||
    allContainers.some((c) => {
      if (!c.selectedAction) return false;
      const a = c.actions.find((x) => x.name === c.selectedAction);
      return a?.risk === RiskLevel.Yellow;
    });

  const visibleCandidates = useMemo(() => {
    if (!selectedCategory) return [];
    const q = search.trim().toLowerCase();
    return allCandidates.filter((c) => {
      if (c.category !== selectedCategory) return false;
      if (riskFilter !== "all") {
        if (riskFilter === "green" && c.risk !== RiskLevel.Green) return false;
        if (riskFilter === "yellow" && c.risk !== RiskLevel.Yellow) return false;
      }
      if (q && !c.displayName.toLowerCase().includes(q) && !c.path.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [allCandidates, selectedCategory, riskFilter, search]);

  const visibleContainers = useMemo(() => {
    if (!selectedCategory) return [];
    const kind =
      selectedCategory === Category.IosSimulators
        ? "ios_simulator"
        : selectedCategory === Category.AndroidAvds
          ? "android_avd"
          : null;
    if (!kind) return [];
    const q = search.trim().toLowerCase();
    return allContainers.filter(
      (c) => c.kind === kind && (!q || c.name.toLowerCase().includes(q)),
    );
  }, [allContainers, selectedCategory, search]);

  const totalSize =
    allCandidates.reduce((s, c) => s + c.size, 0) +
    allContainers.reduce((s, c) => s + c.totalSize, 0);
  const selected = allCandidates.filter((c) => c.selected);
  const selectedCount =
    selected.length +
    allContainers.filter((c) => c.selectedAction !== null).length;
  const selectedSize =
    selected.reduce((s, c) => s + c.size, 0) +
    allContainers.reduce((s, c) => {
      if (!c.selectedAction) return s;
      const a = c.actions.find((x) => x.name === c.selectedAction);
      return s + (a?.estimatedSize ?? 0);
    }, 0);

  async function runScan() {
    // Cancel previous scan if active.
    sizeCalcRef.current?.cancel();
    reset();
    setStatus("scanning");
    try {
      const cache = persistentCacheRef.current;
      await cache.load();
      const sizes = new SizeCalculator({ persistent: cache });
      sizeCalcRef.current = sizes;
      const xcodeScanner = new XcodeScanner(sizes);
      const xcodeP = xcodeScanner.scan().then((r) => setReport(r));
      const androidP = new AndroidScanner(sizes).scan().then((r) => setReport(r));
      await Promise.all([xcodeP, androidP]);
      await cache.save();
      setPermissionsBlocked(xcodeScanner.permissionsBlocked);
      setStatus("ready");
    } catch (e) {
      setStatus("error", e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    void loadConfig().then((cfg) => setLang(cfg.lang));
    void runScan();
    void new ProcessProbe().detect().then(setRunning);
    const t = setTimeout(() => setSplashElapsed(true), SPLASH_MIN_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void saveConfig({ lang });
  }, [lang]);

  useEffect(() => {
    setCursor(0);
  }, [selectedCategory, setCursor]);

  async function startCleanup() {
    setPhase("cleaning");
    setProgressResults([]);
    setProgressFreed(0);
    const cleaner = new Cleaner(undefined, { runningAvds: running?.avdEmulators ?? [] });
    cleanerRef.current = cleaner;
    const touchedPaths: string[] = [];
    const r = await cleaner.run(allCandidates, allContainers, (op) => {
      setProgressResults((arr) => [...arr, op]);
      setProgressFreed((s) => s + (op.freed || 0));
    });
    // Collect touched paths from selected items.
    for (const c of allCandidates) {
      if (c.selected) touchedPaths.push(c.path);
    }
    for (const c of allContainers) {
      if (c.selectedAction) touchedPaths.push(c.path);
    }
    // Invalidate cache entries for cleaned paths.
    const cache = persistentCacheRef.current;
    for (const p of touchedPaths) cache.invalidate(p);
    await cache.save();
    setRunResult(r);
    setPhase("result");
  }

  useInput((input, key) => {
    // Search input mode (highest priority).
    if (searchOpen) {
      if (key.escape) {
        setSearchOpen(false);
        setSearch("");
        return;
      }
      if (key.return) {
        setSearchOpen(false);
        return;
      }
      if (key.backspace || key.delete) {
        setSearch(search.slice(0, -1));
        return;
      }
      if (input && input.length === 1 && !key.ctrl && !key.meta) {
        setSearch(search + input);
        return;
      }
      return;
    }

    // Help overlay
    if (showHelp) {
      if (input === "?" || key.escape) setShowHelp(false);
      return;
    }

    // Confirm phase
    if (phase === "confirming") {
      const blocked = buildIdeWarnings(allCandidates, allContainers, running).length > 0;
      if (input === "y" && !blocked) {
        if (hasYellow) setPhase("yellowWarn");
        else void startCleanup();
        return;
      }
      if (input === "n" || key.escape) {
        setPhase("browse");
        return;
      }
      return;
    }
    // Yellow extra confirm
    if (phase === "yellowWarn") {
      if (input === "Y") {
        void startCleanup();
        return;
      }
      if (input === "n" || key.escape) {
        setPhase("browse");
        return;
      }
      return;
    }
    // Cleaning phase: only escape (cancel)
    if (phase === "cleaning") {
      if (key.escape) {
        cleanerRef.current?.cancel();
      }
      return;
    }
    // Result phase
    if (phase === "result") {
      if (key.return || key.escape) {
        setPhase("browse");
        setRunResult(null);
        void runScan();
      }
      return;
    }

    // Browse phase below.
    if (input === "q" || (key.ctrl && input === "c")) {
      exit();
      return;
    }
    if (input === "d") {
      if (totalToDelete > 0) {
        void new ProcessProbe().detect().then(setRunning);
        setPhase("confirming");
      }
      return;
    }
    if (input === "r") {
      void runScan();
      return;
    }
    if (input === "l") {
      setLang(nextLang(lang));
      return;
    }
    if (input === "?") {
      setShowHelp(true);
      return;
    }
    if (input === "/") {
      setSearchOpen(true);
      return;
    }
    if (input === "f") {
      const next: typeof riskFilter =
        riskFilter === "all" ? "green" : riskFilter === "green" ? "yellow" : "all";
      setRiskFilter(next);
      return;
    }
    if (input === "s") {
      setShowSummary((v) => !v);
      return;
    }
    if (showSummary) {
      if (key.escape) setShowSummary(false);
      return;
    }
    if (key.tab) {
      setFocus(focus === "sidebar" ? "list" : "sidebar");
      return;
    }

    if (focus === "sidebar") {
      if (sidebarItems.length === 0) return;
      if (key.upArrow) {
        const idx = prevCategoryIdx(sidebarItems, sidebarCursor);
        if (idx >= 0) {
          setSidebarCursor(idx);
          const it = sidebarItems[idx];
          if (it && it.kind === "category") setSelectedCategory(it.category);
        }
      } else if (key.downArrow) {
        const idx = nextCategoryIdx(sidebarItems, sidebarCursor);
        if (idx >= 0) {
          setSidebarCursor(idx);
          const it = sidebarItems[idx];
          if (it && it.kind === "category") setSelectedCategory(it.category);
        }
      } else if (key.return || key.rightArrow) {
        setFocus("list");
      }
      return;
    }

    // focus === "list"
    if (key.escape || key.leftArrow || key.backspace || key.delete) {
      setFocus("sidebar");
      return;
    }

    if (visibleContainers.length > 0) {
      const c = visibleContainers[cursor];
      if (key.upArrow) {
        setCursor(Math.max(0, cursor - 1));
      } else if (key.downArrow) {
        setCursor(Math.min(visibleContainers.length - 1, cursor + 1));
      } else if (input === "a" && selectedCategory) {
        toggleAllContainers(selectedCategory);
      } else if (input === "0" && c) {
        setContainerAction(c.id, null);
      } else if (input === "1" && c) {
        setContainerAction(c.id, "soft_clean");
      } else if (input === "2" && c) {
        setContainerAction(c.id, "reset");
      } else if (input === "3" && c) {
        setContainerAction(c.id, "delete");
      }
      return;
    }

    if (visibleCandidates.length === 0) return;
    if (key.upArrow) {
      setCursor(Math.max(0, cursor - 1));
    } else if (key.downArrow) {
      setCursor(Math.min(visibleCandidates.length - 1, cursor + 1));
    } else if (input === " ") {
      const c = visibleCandidates[cursor];
      if (c) toggle(c.id);
    } else if (input === "a" && selectedCategory) {
      toggleAll(selectedCategory);
    }
  });

  const noResultsYet = allCandidates.length === 0 && allContainers.length === 0;
  const showingSplash = !splashElapsed || (status === "scanning" && noResultsYet);

  if (showingSplash) {
    return <Splash d={d} version={version} />;
  }

  if (phase === "confirming") {
    return (
      <ConfirmModal
        candidates={allCandidates}
        containers={allContainers}
        d={d}
        running={running}
      />
    );
  }
  if (phase === "yellowWarn") {
    return (
      <YellowWarningModal
        candidates={allCandidates}
        containers={allContainers}
        d={d}
      />
    );
  }
  if (phase === "cleaning") {
    return (
      <ProgressScreen
        results={progressResults}
        total={totalToDelete}
        done={progressResults.length}
        freed={progressFreed}
        d={d}
      />
    );
  }
  if (phase === "result" && runResult) {
    return <ResultScreen result={runResult} d={d} />;
  }
  if (showHelp) {
    return <HelpScreen d={d} />;
  }

  return (
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor={theme.accent} paddingX={1}>
        <Text>
          <Text color={theme.accent} bold>
            Dev Mobile Cleaner
          </Text>
          <Text color={theme.dim}> v{version}</Text>
          {status === "scanning" ? (
            <Text color={theme.green}> · {d.scanning}</Text>
          ) : null}
        </Text>
      </Box>
      {permissionsBlocked ? (
        <Box paddingX={1}>
          <Text color={theme.yellow}>
            ⚠ {d.permissionsBanner}
          </Text>
        </Box>
      ) : null}
      {(searchOpen || search || riskFilter !== "all") ? (
        <Box paddingX={1}>
          {searchOpen || search ? (
            <Text>
              <Text color={theme.accent}>{d.searchPrompt} </Text>
              <Text inverse={searchOpen}>
                {search || (searchOpen ? " " : "")}
              </Text>
              {searchOpen ? (
                <Text color={theme.dim}>  [enter] aplicar  ·  [esc] cancelar</Text>
              ) : (
                <Text color={theme.dim}>  [/] editar  ·  [esc] limpiar</Text>
              )}
            </Text>
          ) : null}
          {riskFilter !== "all" ? (
            <Text>
              {(searchOpen || search) ? "  ·  " : ""}
              <Text color={theme.dim}>{d.filterLabel} </Text>
              <Text color={riskFilter === "green" ? theme.green : theme.yellow}>
                {riskFilter === "green" ? d.filterGreen : d.filterYellow}
              </Text>
            </Text>
          ) : null}
        </Box>
      ) : null}

      {showSummary ? (
        <SummaryScreen
          candidates={allCandidates}
          containers={allContainers}
          d={d}
        />
      ) : null}
      {!showSummary ? (
      <Box>
        <Sidebar
          items={sidebarItems}
          cursor={sidebarCursor}
          focused={focus === "sidebar"}
          selectedCategory={selectedCategory}
          d={d}
        />
        <CategoryView
          category={selectedCategory}
          candidates={visibleCandidates}
          containers={visibleContainers}
          cursor={cursor}
          focused={focus === "list"}
          viewport={viewport}
          d={d}
        />
      </Box>
      ) : null}

      <StatusLine
        status={status}
        totalCandidates={allCandidates.length + allContainers.length}
        totalSize={totalSize}
        selectedCount={selectedCount}
        selectedSize={selectedSize}
        error={error}
        d={d}
        lang={lang}
      />
    </Box>
  );
}

function nextCategoryIdx(items: SidebarItem[], from: number): number {
  for (let i = from + 1; i < items.length; i++) {
    if (items[i]?.kind === "category") return i;
  }
  for (let i = 0; i <= from; i++) {
    if (items[i]?.kind === "category") return i;
  }
  return -1;
}

function prevCategoryIdx(items: SidebarItem[], from: number): number {
  for (let i = from - 1; i >= 0; i--) {
    if (items[i]?.kind === "category") return i;
  }
  for (let i = items.length - 1; i >= from; i--) {
    if (items[i]?.kind === "category") return i;
  }
  return -1;
}

void Tool;
