import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

let cached: string | null = null;

export function getVersion(): string {
  if (cached) return cached;
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    // dist/version.js → ../package.json
    const pkgPath = path.resolve(here, "..", "package.json");
    const json = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
    cached = json.version ?? "0.0.0";
  } catch {
    cached = "0.0.0";
  }
  return cached;
}
