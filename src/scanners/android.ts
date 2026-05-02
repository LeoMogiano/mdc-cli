import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Scanner } from "./base.js";
import { ToolReport } from "../models/scan.js";
import { Tool } from "../models/enums.js";
import { SizeCalculator } from "../services/sizeCalculator.js";
import { AndroidGradleScanner } from "./androidGradle.js";
import { AndroidCachesScanner } from "./androidCaches.js";
import { AndroidStudioScanner } from "./androidStudio.js";
import { AndroidAvdsScanner } from "./androidAvds.js";
import { AndroidSdkScanner } from "./androidSdk.js";

const HOME = os.homedir();

const PROBE_PATHS = [
  path.join(HOME, ".gradle"),
  path.join(HOME, ".android"),
  path.join(HOME, "Library/Android/sdk"),
  path.join(HOME, "Library/Application Support/Google"),
];

export class AndroidScanner implements Scanner {
  constructor(private sizes: SizeCalculator = new SizeCalculator()) {}

  async scan(): Promise<ToolReport> {
    const installed = await isInstalled();
    if (!installed) {
      return { tool: Tool.Android, candidates: [], containers: [] };
    }
    const [gradle, caches, studio, sdk, avds] = await Promise.all([
      new AndroidGradleScanner(this.sizes).scan(),
      new AndroidCachesScanner(this.sizes).scan(),
      new AndroidStudioScanner(this.sizes).scan(),
      new AndroidSdkScanner(this.sizes).scan(),
      new AndroidAvdsScanner(undefined, this.sizes).scan().catch(() => []),
    ]);
    return {
      tool: Tool.Android,
      candidates: [...gradle, ...caches, ...studio, ...sdk],
      containers: avds,
    };
  }
}

async function isInstalled(): Promise<boolean> {
  for (const p of PROBE_PATHS) {
    try {
      await fs.access(p);
      return true;
    } catch {
      // continue
    }
  }
  return false;
}
