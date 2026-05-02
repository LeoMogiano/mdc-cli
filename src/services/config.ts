import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Lang } from "../tui/i18n.js";

const CONFIG_DIR = path.join(os.homedir(), ".config/mdc");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export interface AppConfig {
  lang: Lang;
}

const DEFAULT: AppConfig = { lang: "en" };

export async function loadConfig(): Promise<AppConfig> {
  try {
    const text = await fs.readFile(CONFIG_FILE, "utf8");
    const data = JSON.parse(text) as Partial<AppConfig>;
    return { ...DEFAULT, ...data };
  } catch {
    return { ...DEFAULT };
  }
}

export async function saveConfig(cfg: AppConfig): Promise<void> {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    await fs.writeFile(CONFIG_FILE, JSON.stringify(cfg, null, 2));
  } catch {
    // ignore
  }
}
