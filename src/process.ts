// run a fixed local tool without shell string injection.
// windows needs a shell to launch npm.cmd, so the command is
// joined there; every caller passes fixed or regex-validated
// args only, never raw user input.
import { execFile, type ChildProcess, type ExecFileOptions } from "node:child_process";

type ToolOptions = Omit<ExecFileOptions, "encoding" | "signal" | "killSignal">;

export function runTool(file: string, args: string[], options: ToolOptions = {}): ChildProcess {
  if (process.platform === "win32") {
    return execFile(`${file} ${args.join(" ")}`, { ...options, shell: true });
  }
  return execFile(file, args, options);
}
