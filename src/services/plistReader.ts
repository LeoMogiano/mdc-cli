import { ProcessRunner } from "./processRunner.js";

export class PlistReader {
  constructor(private runner: ProcessRunner = new ProcessRunner()) {}

  async read(path: string): Promise<unknown | null> {
    const r = await this.runner.run("/usr/bin/plutil", ["-convert", "json", "-o", "-", path], {
      timeoutMs: 5_000,
    });
    if (r.exitCode !== 0 || !r.stdout) return null;
    try {
      return JSON.parse(r.stdout);
    } catch {
      return null;
    }
  }
}
