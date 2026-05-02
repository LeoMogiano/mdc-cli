import { execa, ExecaError } from "execa";

export interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  timeoutMs?: number;
  input?: string;
}

export class ProcessRunner {
  async run(
    executable: string,
    args: readonly string[],
    opts: RunOptions = {},
  ): Promise<ProcessResult> {
    try {
      const r = await execa(executable, [...args], {
        timeout: opts.timeoutMs ?? 30_000,
        reject: false,
        ...(opts.input !== undefined ? { input: opts.input } : {}),
      });
      return {
        exitCode: typeof r.exitCode === "number" ? r.exitCode : -1,
        stdout: r.stdout ?? "",
        stderr: r.stderr ?? "",
      };
    } catch (e) {
      const err = e as ExecaError;
      return {
        exitCode: typeof err.exitCode === "number" ? err.exitCode : -1,
        stdout: typeof err.stdout === "string" ? err.stdout : "",
        stderr: typeof err.stderr === "string" ? err.stderr : err.message,
      };
    }
  }
}
