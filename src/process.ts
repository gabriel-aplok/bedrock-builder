// run a fixed local tool without shell injection; windows needs a shell for npm.cmd.
import { execFile, type ChildProcess, type ExecFileOptions } from "node:child_process";

type ToolOptions = Omit<ExecFileOptions, "encoding" | "signal" | "killSignal">;

function quoteForShell(value: string): string {
  return /\s/.test(value) ? `"${value}"` : value;
}

// one windows command line from a file and its args.
export function shellLine(file: string, args: string[]): string {
  return [file, ...args].map(quoteForShell).join(" ");
}

export function runTool(file: string, args: string[], options: ToolOptions = {}): ChildProcess {
  if (process.platform === "win32") {
    return execFile(shellLine(file, args), { ...options, shell: true });
  }
  return execFile(file, args, options);
}
