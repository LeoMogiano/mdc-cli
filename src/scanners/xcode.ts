import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import pLimit from "p-limit";
import { Scanner } from "./base.js";
import { ToolReport } from "../models/scan.js";
import { CleanupCandidate } from "../models/candidate.js";
import { Category, ExecutionKind, RiskLevel, Tool } from "../models/enums.js";
import { ExecutionStrategy } from "../models/execution.js";
import { SizeCalculator } from "../services/sizeCalculator.js";
import { PlistReader } from "../services/plistReader.js";
import { XcodeSimulatorsScanner } from "./xcodeSimulators.js";
import { ContainerCandidate } from "../models/container.js";

const HOME = os.homedir();

const PATHS = {
  derivedData: path.join(HOME, "Library/Developer/Xcode/DerivedData"),
  // §3.1 green direct trash
  greenDirect: [
    {
      path: path.join(HOME, "Library/Developer/CoreSimulator/Caches"),
      category: Category.XcodeCaches,
      reason: "CoreSimulator caches (incluye dyld)",
    },
    {
      path: path.join(HOME, "Library/Logs/CoreSimulator"),
      category: Category.XcodeCaches,
      reason: "Logs del simulador",
    },
    {
      path: path.join(HOME, "Library/Caches/com.apple.dt.Xcode"),
      category: Category.XcodeCaches,
      reason: "Caché de Xcode",
    },
    {
      path: path.join(HOME, "Library/Caches/org.swift.swiftpm"),
      category: Category.XcodeCaches,
      reason: "Swift Package Manager cache",
    },
    {
      path: path.join(HOME, "Library/Caches/com.apple.amp.itmstransporter"),
      category: Category.XcodeCaches,
      reason: "iTunes Transporter cache",
    },
    {
      path: path.join(HOME, "Library/Developer/XCPGDevices"),
      category: Category.XcodeCaches,
      reason: "Playground devices",
    },
    {
      path: path.join(HOME, "Library/Developer/Xcode/Packages"),
      category: Category.XcodeCaches,
      reason: "Swift Packages metadata",
    },
    {
      path: path.join(HOME, "Library/Developer/Xcode/DeveloperDiskImages"),
      category: Category.XcodeCaches,
      reason: "Developer disk images iOS",
    },
    {
      path: path.join(HOME, "Library/Developer/Xcode/DVTDownloads"),
      category: Category.XcodeCaches,
      reason: "Developer Toolkit downloads",
    },
    {
      path: path.join(HOME, "Library/Developer/Xcode/UserData/IDEEditorInteractivityHistory"),
      category: Category.XcodeCaches,
      reason: "Historial del editor",
    },
    {
      path: path.join(HOME, "Library/Developer/Xcode/UserData/IB Support"),
      category: Category.XcodeCaches,
      reason: "Caché de Interface Builder",
    },
    {
      path: path.join(HOME, "Library/Developer/Shared/Documentation/DocSets"),
      category: Category.XcodeCaches,
      reason: "Docsets legacy",
    },
  ],
  // §3.5 ecosistema iOS green
  ecosystemGreen: [
    {
      path: path.join(HOME, "Library/Caches/CocoaPods"),
      category: Category.CocoaPods,
      reason: "Caché de descargas CocoaPods",
    },
    {
      path: path.join(HOME, "Library/Caches/org.carthage.CarthageKit"),
      category: Category.Carthage,
      reason: "Caché de Carthage",
    },
    {
      path: path.join(HOME, ".fastlane"),
      category: Category.Fastlane,
      reason: "Caché de Fastlane",
    },
  ],
  // §3.3 yellow
  archives: path.join(HOME, "Library/Developer/Xcode/Archives"),
  deviceSupport: [
    { path: path.join(HOME, "Library/Developer/Xcode/iOS DeviceSupport"), os: "iOS" },
    { path: path.join(HOME, "Library/Developer/Xcode/watchOS DeviceSupport"), os: "watchOS" },
    { path: path.join(HOME, "Library/Developer/Xcode/tvOS DeviceSupport"), os: "tvOS" },
    { path: path.join(HOME, "Library/Developer/Xcode/visionOS DeviceSupport"), os: "visionOS" },
  ],
  runtimes: "/Library/Developer/CoreSimulator/Profiles/Runtimes",
  previews: path.join(HOME, "Library/Developer/Xcode/UserData/Previews"),
  cocoapodsRepos: path.join(HOME, ".cocoapods/repos"),
};

export class XcodeScanner implements Scanner {
  private limit = pLimit(8);
  private plistReader = new PlistReader();
  permissionsBlocked = false;

  constructor(private sizes: SizeCalculator = new SizeCalculator()) {}

  async scan(): Promise<ToolReport> {
    const candidateTasks: Promise<CleanupCandidate[]>[] = [
      this.scanDerivedData(),
      this.scanGreenDirect(),
      this.scanEcosystemGreen(),
      this.scanArchives(),
      this.scanDeviceSupport(),
      this.scanRuntimes(),
      this.scanPreviews(),
      this.scanCocoapodsRepos(),
    ];
    const containerTask: Promise<ContainerCandidate[]> = new XcodeSimulatorsScanner(
      undefined,
      this.sizes,
    ).scan().catch(() => []);

    const [groups, containers] = await Promise.all([
      Promise.all(candidateTasks),
      containerTask,
    ]);
    const candidates = groups.flat();
    return { tool: Tool.Xcode, candidates, containers };
  }

  private async scanDerivedData(): Promise<CleanupCandidate[]> {
    const root = PATHS.derivedData;
    const entries = await safeReaddir(root);
    if (!entries) return [];
    const dirs = entries.filter((e) => e.isDirectory());

    const enriched = await Promise.all(
      dirs.map((entry) =>
        this.limit(async () => {
          const fullPath = path.join(root, entry.name);
          const size = await this.sizes.size(fullPath);
          const meta = await this.derivedMetadata(entry.name, fullPath);
          return { entry, fullPath, size, meta };
        }),
      ),
    );

    // Resolve display names and groups, dedupe colliding project names.
    const projectNameCounts = new Map<string, number>();
    for (const { meta } of enriched) {
      if (meta.kind === "project" && meta.projectName) {
        projectNameCounts.set(
          meta.projectName,
          (projectNameCounts.get(meta.projectName) ?? 0) + 1,
        );
      }
    }

    const candidates: CleanupCandidate[] = enriched.map(({ entry, fullPath, size, meta }) => {
      let displayName: string;
      let group: string;
      let reason: string;
      if (meta.kind === "noindex") {
        displayName = noindexLabel(entry.name);
        group = "global_caches";
        reason = "Caché compartido de Xcode (regenerable)";
      } else if (meta.kind === "project") {
        const baseName = meta.projectName ?? truncatedHash(entry.name);
        const count = meta.projectName ? projectNameCounts.get(meta.projectName) ?? 1 : 1;
        const needsParent = count > 1 && meta.parentDir;
        displayName = needsParent ? `${meta.parentDir}/${baseName}` : baseName;
        group = "projects";
        reason = meta.workspacePath ? `Build de ${meta.workspacePath}` : "Build intermedio";
      } else {
        const base = meta.projectName ?? truncatedHash(entry.name);
        const hash = shortHash(entry.name);
        displayName = hash ? `${base} <${hash}> (orphan)` : `${base} (orphan)`;
        group = "orphans";
        reason = "Proyecto original ya no existe en disco";
      }

      return makeCandidate({
        id: `xcode:derived:${entry.name}`,
        path: fullPath,
        displayName,
        risk: RiskLevel.Green,
        category: Category.DerivedData,
        size,
        reason,
        execution: { kind: ExecutionKind.Remove, path: fullPath },
        group,
      });
    });

    // Order: caches → proyectos size desc → huérfanos size desc.
    const groupRank: Record<string, number> = {
      global_caches: 0,
      projects: 1,
      orphans: 2,
    };
    candidates.sort((a, b) => {
      const ga = groupRank[a.group ?? ""] ?? 99;
      const gb = groupRank[b.group ?? ""] ?? 99;
      if (ga !== gb) return ga - gb;
      return b.size - a.size;
    });
    return candidates;
  }

  private async derivedMetadata(
    name: string,
    fullPath: string,
  ): Promise<DerivedMeta> {
    if (name.endsWith(".noindex")) return { kind: "noindex" };

    const infoPlist = path.join(fullPath, "info.plist");
    if (!(await pathExists(infoPlist))) {
      return { kind: "orphan", projectName: parseHashedName(name) };
    }

    const data = (await this.plistReader.read(infoPlist)) as
      | { WorkspacePath?: string }
      | null;
    const wsPath = data?.WorkspacePath;
    if (!wsPath || typeof wsPath !== "string") {
      return { kind: "orphan", projectName: parseHashedName(name) };
    }

    const projectName = path.basename(wsPath).replace(/\.(xcodeproj|xcworkspace)$/i, "");
    const parentDir = path.basename(path.dirname(wsPath));
    const exists = await pathExists(wsPath);
    if (!exists) return { kind: "orphan", projectName };
    return { kind: "project", projectName, parentDir, workspacePath: wsPath };
  }

  private async scanGreenDirect(): Promise<CleanupCandidate[]> {
    return this.scanFlatPaths(PATHS.greenDirect, RiskLevel.Green, "xcode:green");
  }

  private async scanEcosystemGreen(): Promise<CleanupCandidate[]> {
    return this.scanFlatPaths(PATHS.ecosystemGreen, RiskLevel.Green, "xcode:eco");
  }

  private async scanFlatPaths(
    items: ReadonlyArray<{ path: string; category: Category; reason: string }>,
    risk: RiskLevel,
    idPrefix: string,
  ): Promise<CleanupCandidate[]> {
    const results = await Promise.all(
      items.map((item) =>
        this.limit(async (): Promise<CleanupCandidate | null> => {
          if (!(await pathExists(item.path))) return null;
          const size = await this.sizes.size(item.path);
          if (size === 0) return null;
          return makeCandidate({
            id: `${idPrefix}:${item.path}`,
            path: item.path,
            displayName: path.basename(item.path),
            risk,
            category: item.category,
            size,
            reason: item.reason,
            execution: { kind: ExecutionKind.Remove, path: item.path },
          });
        }),
      ),
    );
    return results.filter((c): c is CleanupCandidate => c !== null).sort(bySizeDesc);
  }

  private async scanArchives(): Promise<CleanupCandidate[]> {
    const entries = await safeReaddir(PATHS.archives);
    if (!entries) return [];
    const dirs = entries.filter((e) => e.isDirectory());
    return Promise.all(
      dirs.map((entry) =>
        this.limit(async (): Promise<CleanupCandidate> => {
          const fullPath = path.join(PATHS.archives, entry.name);
          const size = await this.sizes.size(fullPath);
          return makeCandidate({
            id: `xcode:archives:${entry.name}`,
            path: fullPath,
            displayName: entry.name,
            risk: RiskLevel.Yellow,
            category: Category.XcodeArchives,
            size,
            reason: "Archive de build (posible submission)",
            execution: { kind: ExecutionKind.Remove, path: fullPath },
          });
        }),
      ),
    ).then(sortBySize);
  }

  // §3.3: todos los DeviceSupport como candidatos ð¡; usuario decide.
  private async scanDeviceSupport(): Promise<CleanupCandidate[]> {
    const out: CleanupCandidate[] = [];
    for (const { path: root, os: osName } of PATHS.deviceSupport) {
      const entries = await safeReaddir(root);
      if (!entries) continue;
      const dirs = entries.filter((e) => e.isDirectory());

      const candidates = await Promise.all(
        dirs.map((e) =>
          this.limit(async (): Promise<CleanupCandidate> => {
            const full = path.join(root, e.name);
            const size = await this.sizes.size(full);
            return makeCandidate({
              id: `xcode:devsupport:${osName}:${e.name}`,
              path: full,
              displayName: `${osName} ${e.name}`,
              risk: RiskLevel.Yellow,
              category: osCategory(osName),
              size,
              reason: `${osName} DeviceSupport (re-descarga al conectar device)`,
              execution: { kind: ExecutionKind.Remove, path: full },
            });
          }),
        ),
      );
      out.push(...candidates);
    }
    return out.sort(bySizeDesc);
  }

  private async scanRuntimes(): Promise<CleanupCandidate[]> {
    const root = PATHS.runtimes;
    // Check existence vs permission denied.
    try {
      await fs.readdir(root);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === "EACCES" || code === "EPERM") {
        this.permissionsBlocked = true;
      }
      return [];
    }
    const entries = await safeReaddir(root);
    if (!entries) return [];
    const dirs = entries.filter((e) => e.isDirectory());
    return Promise.all(
      dirs.map((entry) =>
        this.limit(async (): Promise<CleanupCandidate> => {
          const fullPath = path.join(root, entry.name);
          const size = await this.sizes.size(fullPath);
          const exec: ExecutionStrategy = {
            kind: ExecutionKind.CliCommand,
            executable: "/usr/bin/xcrun",
            args: ["simctl", "runtime", "delete", "unavailable"],
          };
          return makeCandidate({
            id: `xcode:runtime:${entry.name}`,
            path: fullPath,
            displayName: entry.name,
            risk: RiskLevel.Yellow,
            category: Category.IosRuntimes,
            size,
            reason: "Runtime simulador (simctl runtime delete unavailable)",
            execution: exec,
          });
        }),
      ),
    ).then(sortBySize);
  }

  private async scanPreviews(): Promise<CleanupCandidate[]> {
    const root = PATHS.previews;
    if (!(await pathExists(root))) return [];
    const size = await this.sizes.size(root);
    if (size === 0) return [];
    const exec: ExecutionStrategy = {
      kind: ExecutionKind.CliCommand,
      executable: "/usr/bin/xcrun",
      args: ["simctl", "--set", "previews", "delete", "all"],
    };
    return [
      makeCandidate({
        id: `xcode:previews`,
        path: root,
        displayName: "Xcode Previews",
        risk: RiskLevel.Yellow,
        category: Category.XcodePreviews,
        size,
        reason: "simctl --set previews delete all",
        execution: exec,
      }),
    ];
  }

  private async scanCocoapodsRepos(): Promise<CleanupCandidate[]> {
    const root = PATHS.cocoapodsRepos;
    if (!(await pathExists(root))) return [];
    const size = await this.sizes.size(root);
    if (size === 0) return [];
    return [
      makeCandidate({
        id: `xcode:cocoapods-repos`,
        path: root,
        displayName: "CocoaPods specs repos",
        risk: RiskLevel.Yellow,
        category: Category.CocoaPods,
        size,
        reason: "Specs repo (re-descarga lenta)",
        execution: { kind: ExecutionKind.Remove, path: root },
      }),
    ];
  }
}

type DerivedMeta =
  | { kind: "noindex" }
  | {
      kind: "project";
      projectName: string;
      parentDir: string;
      workspacePath: string;
    }
  | { kind: "orphan"; projectName: string | null };

function parseHashedName(name: string): string | null {
  const idx = name.lastIndexOf("-");
  if (idx <= 0) return null;
  return name.slice(0, idx);
}

function shortHash(name: string): string | null {
  const idx = name.lastIndexOf("-");
  if (idx <= 0) return null;
  return name.slice(idx + 1, idx + 1 + 6);
}

function truncatedHash(name: string): string {
  const idx = name.lastIndexOf("-");
  if (idx <= 0) return name;
  const base = name.slice(0, idx);
  const hash = name.slice(idx + 1, idx + 1 + 6);
  return `${base} <${hash}>`;
}

function noindexLabel(name: string): string {
  return name.replace(/\.noindex$/i, "");
}

function makeCandidate(
  partial: Omit<CleanupCandidate, "tool" | "selected">,
): CleanupCandidate {
  return {
    ...partial,
    tool: Tool.Xcode,
    selected: false,
  };
}

function bySizeDesc(a: CleanupCandidate, b: CleanupCandidate): number {
  return b.size - a.size;
}

function sortBySize(arr: CleanupCandidate[]): CleanupCandidate[] {
  return arr.sort(bySizeDesc);
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function safeReaddir(p: string): Promise<import("node:fs").Dirent[] | null> {
  try {
    return await fs.readdir(p, { withFileTypes: true });
  } catch {
    return null;
  }
}

function osCategory(osName: string): Category {
  // Solo iOS DeviceSupport tiene categoría dedicada en el enum; resto reusa.
  void osName;
  return Category.IosDeviceSupport;
}
