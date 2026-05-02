import { ProcessRunner } from "./processRunner.js";

export interface RunningProcesses {
  xcode: boolean;
  androidStudio: boolean;
  simulators: boolean;
  avdEmulators: string[]; // AVD names currently running, if detectable
}

// Use exact-match-only patterns to avoid false positives from system daemons.
const PATTERNS = {
  // Match Xcode.app/Contents/MacOS/Xcode (real GUI) but not xcode-select etc.
  xcode: ["/Xcode.app/Contents/MacOS/Xcode"],
  androidStudio: [
    "/Android Studio.app/Contents/MacOS/studio",
    "studio.sh",
  ],
  // Real Simulator GUI binary only — skip CoreSimulatorService daemons.
  simulators: ["/Simulator.app/Contents/MacOS/Simulator"],
  emulator: ["qemu-system", "/emulator/qemu/", "emulator64"],
};

export class ProcessProbe {
  constructor(private runner: ProcessRunner = new ProcessRunner()) {}

  async detect(): Promise<RunningProcesses> {
    const [xc, as, sim, emu] = await Promise.all([
      this.matchAny(PATTERNS.xcode),
      this.matchAny(PATTERNS.androidStudio),
      this.matchAny(PATTERNS.simulators),
      this.listEmulators(),
    ]);
    return {
      xcode: xc,
      androidStudio: as,
      simulators: sim,
      avdEmulators: emu,
    };
  }

  private async matchAny(patterns: string[]): Promise<boolean> {
    for (const p of patterns) {
      const r = await this.runner.run("/usr/bin/pgrep", ["-f", p], {
        timeoutMs: 3_000,
      });
      if (r.exitCode === 0 && r.stdout.trim().length > 0) return true;
    }
    return false;
  }

  // Returns AVD names currently running. Uses `pgrep -lf qemu-system` and parses
  // the @<avdname> arg from the cmdline.
  private async listEmulators(): Promise<string[]> {
    const r = await this.runner.run("/bin/ps", ["-axo", "command="], {
      timeoutMs: 3_000,
    });
    if (r.exitCode !== 0) return [];
    const out: string[] = [];
    for (const line of r.stdout.split("\n")) {
      if (!/qemu-system|emulator64|emulator-headless/.test(line)) continue;
      const m = line.match(/@([A-Za-z0-9_.\-]+)/);
      if (m && m[1]) out.push(m[1]);
    }
    return Array.from(new Set(out));
  }
}
