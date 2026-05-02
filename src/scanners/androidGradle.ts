import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import pLimit from "p-limit";
import { CleanupCandidate } from "../models/candidate.js";
import { Category, ExecutionKind, RiskLevel, Tool } from "../models/enums.js";
import { SizeCalculator } from "../services/sizeCalculator.js";

const HOME = os.homedir();

const GRADLE_ROOT = path.join(HOME, ".gradle");
const GRADLE_CACHES = path.join(GRADLE_ROOT, "caches");
const GRADLE_MODULES2 = path.join(GRADLE_CACHES, "modules-2");
const GRADLE_DAEMON = path.join(GRADLE_ROOT, "daemon");
const GRADLE_NATIVE = path.join(GRADLE_ROOT, "native");
const GRADLE_NOTIFICATIONS = path.join(GRADLE_ROOT, "notifications");
const GRADLE_JDKS = path.join(GRADLE_ROOT, "jdks");
const GRADLE_WRAPPERS = path.join(GRADLE_ROOT, "wrapper", "dists");
const KOTLIN_DAEMON = path.join(HOME, ".kotlin", "daemon");

export class AndroidGradleScanner {
  private limit = pLimit(8);
  constructor(private sizes: SizeCalculator = new SizeCalculator()) {}

  async scan(): Promise<CleanupCandidate[]> {
    const tasks: Promise<CleanupCandidate[]>[] = [
      this.gradleCachesGreen(),
      this.modules2Yellow(),
      this.daemonGreen(),
      this.gradleAuxGreen(),
      this.jdksYellow(),
      this.wrappersYellow(),
      this.kotlinDaemon(),
    ];
    const groups = await Promise.all(tasks);
    return groups.flat();
  }

  // ~/.gradle/caches/* excluding modules-2 → green, one candidate per subdir.
  private async gradleCachesGreen(): Promise<CleanupCandidate[]> {
    const entries = await safeReaddir(GRADLE_CACHES);
    if (!entries) return [];
    const dirs = entries.filter((e) => e.isDirectory() && e.name !== "modules-2");
    const list = await Promise.all(
      dirs.map((entry) =>
        this.limit(async (): Promise<CleanupCandidate> => {
          const full = path.join(GRADLE_CACHES, entry.name);
          const size = await this.sizes.size(full);
          return makeCandidate({
            id: `android:gradle:caches:${entry.name}`,
            path: full,
            displayName: entry.name,
            risk: RiskLevel.Green,
            category: Category.GradleCaches,
            size,
            reason: gradleCacheReason(entry.name),
            execution: { kind: ExecutionKind.Remove, path: full },
            group: gradleCacheGroup(entry.name),
          });
        }),
      ),
    );
    const groupRank: Record<string, number> = {
      gradle_versions: 0,
      build_cache: 1,
      jars_transforms: 2,
      metadata: 3,
    };
    return filterEmpty(list).sort((a, b) => {
      const ra = groupRank[a.group ?? ""] ?? 99;
      const rb = groupRank[b.group ?? ""] ?? 99;
      if (ra !== rb) return ra - rb;
      return b.size - a.size;
    });
  }

  private async modules2Yellow(): Promise<CleanupCandidate[]> {
    if (!(await pathExists(GRADLE_MODULES2))) return [];
    const size = await this.sizes.size(GRADLE_MODULES2);
    if (size === 0) return [];
    return [
      makeCandidate({
        id: `android:gradle:modules-2`,
        path: GRADLE_MODULES2,
        displayName: "modules-2 (deps Maven)",
        risk: RiskLevel.Yellow,
        category: Category.GradleDeps,
        size,
        reason: "Borrar = re-descarga de dependencias",
        execution: { kind: ExecutionKind.Remove, path: GRADLE_MODULES2 },
      }),
    ];
  }

  private async daemonGreen(): Promise<CleanupCandidate[]> {
    if (!(await pathExists(GRADLE_DAEMON))) return [];
    const size = await this.sizes.size(GRADLE_DAEMON);
    if (size === 0) return [];
    return [
      makeCandidate({
        id: `android:gradle:daemon`,
        path: GRADLE_DAEMON,
        displayName: "daemon",
        risk: RiskLevel.Green,
        category: Category.GradleDaemon,
        size,
        reason: "Logs del Gradle daemon",
        execution: { kind: ExecutionKind.Remove, path: GRADLE_DAEMON },
      }),
    ];
  }

  private async gradleAuxGreen(): Promise<CleanupCandidate[]> {
    const out: CleanupCandidate[] = [];
    for (const [p, label] of [
      [GRADLE_NATIVE, "native"] as const,
      [GRADLE_NOTIFICATIONS, "notifications"] as const,
    ]) {
      if (!(await pathExists(p))) continue;
      const size = await this.sizes.size(p);
      if (size === 0) continue;
      out.push(
        makeCandidate({
          id: `android:gradle:aux:${label}`,
          path: p,
          displayName: label,
          risk: RiskLevel.Green,
          category: Category.GradleCaches,
          size,
          reason: "Auxiliar Gradle",
          execution: { kind: ExecutionKind.Remove, path: p },
          group: "metadata",
        }),
      );
    }
    return out;
  }

  private async jdksYellow(): Promise<CleanupCandidate[]> {
    const entries = await safeReaddir(GRADLE_JDKS);
    if (!entries) return [];
    const dirs = entries.filter((e) => e.isDirectory());
    return Promise.all(
      dirs.map((entry) =>
        this.limit(async (): Promise<CleanupCandidate> => {
          const full = path.join(GRADLE_JDKS, entry.name);
          const size = await this.sizes.size(full);
          return makeCandidate({
            id: `android:gradle:jdks:${entry.name}`,
            path: full,
            displayName: entry.name,
            risk: RiskLevel.Yellow,
            category: Category.GradleJdks,
            size,
            reason: "JDK toolchain (puede estar en uso)",
            execution: { kind: ExecutionKind.Remove, path: full },
          });
        }),
      ),
    ).then(filterEmpty);
  }

  private async wrappersYellow(): Promise<CleanupCandidate[]> {
    const entries = await safeReaddir(GRADLE_WRAPPERS);
    if (!entries) return [];
    const dirs = entries.filter((e) => e.isDirectory());
    return Promise.all(
      dirs.map((entry) =>
        this.limit(async (): Promise<CleanupCandidate> => {
          const full = path.join(GRADLE_WRAPPERS, entry.name);
          const size = await this.sizes.size(full);
          return makeCandidate({
            id: `android:gradle:wrapper:${entry.name}`,
            path: full,
            displayName: entry.name,
            risk: RiskLevel.Yellow,
            category: Category.GradleWrappers,
            size,
            reason: "Versión de Gradle descargada",
            execution: { kind: ExecutionKind.Remove, path: full },
          });
        }),
      ),
    ).then(filterEmpty);
  }

  private async kotlinDaemon(): Promise<CleanupCandidate[]> {
    if (!(await pathExists(KOTLIN_DAEMON))) return [];
    const size = await this.sizes.size(KOTLIN_DAEMON);
    if (size === 0) return [];
    return [
      makeCandidate({
        id: `android:kotlin:daemon`,
        path: KOTLIN_DAEMON,
        displayName: "kotlin daemon",
        risk: RiskLevel.Green,
        category: Category.KotlinDaemon,
        size,
        reason: "Kotlin daemon logs",
        execution: { kind: ExecutionKind.Remove, path: KOTLIN_DAEMON },
      }),
    ];
  }
}

function makeCandidate(p: Omit<CleanupCandidate, "tool" | "selected">): CleanupCandidate {
  return {
    ...p,
    tool: Tool.Android,
    selected: false,
  };
}

function gradleCacheGroup(name: string): string {
  if (/^\d+\.\d+/.test(name)) return "gradle_versions";
  if (name.startsWith("build-cache")) return "build_cache";
  if (name.startsWith("jars") || name.startsWith("transforms")) return "jars_transforms";
  return "metadata";
}

function gradleCacheReason(name: string): string {
  const g = gradleCacheGroup(name);
  switch (g) {
    case "gradle_versions":
      return `Cache compilada para Gradle ${name}`;
    case "build_cache":
      return "Build cache local (regenerable)";
    case "jars_transforms":
      return "JARs/transforms procesados";
    default:
      return "Metadata de Gradle";
  }
}

function filterEmpty(arr: CleanupCandidate[]): CleanupCandidate[] {
  return arr.filter((c) => c.size > 0);
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

export const androidGradleRoots = [GRADLE_ROOT, KOTLIN_DAEMON];
