import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

export interface TypeDiagnostic {
  file: string;
  line: number;
  column: number;
  code: string;
  message: string;
}

export interface TypecheckResult {
  ran: boolean;
  ok: boolean;
  reason: string;
  diagnostics: TypeDiagnostic[];
}

export class TypecheckError extends Error {
  readonly exitCode = 6;
  readonly diagnostics: TypeDiagnostic[];
  constructor(diagnostics: TypeDiagnostic[], detail = "") {
    const message =
      diagnostics.length > 0
        ? `Typecheck found ${diagnostics.length} error(s).`
        : `Typecheck could not run:\n${detail}`;
    super(message);
    this.name = "TypecheckError";
    this.diagnostics = diagnostics;
  }
}

// tsc prints "path(line,col): error TSxxxx: message" per line.
const DIAG = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;

export function parseDiagnostics(output: string): TypeDiagnostic[] {
  const found: TypeDiagnostic[] = [];
  for (const line of output.split(/\r?\n/)) {
    const hit = DIAG.exec(line.trim());
    if (hit === null) continue;
    found.push({
      file: hit[1]!,
      line: Number(hit[2]),
      column: Number(hit[3]),
      code: hit[4]!,
      message: hit[5]!,
    });
  }
  return found;
}

// resolve the project's own typescript, so addon tsconfig rules apply.
function projectTsc(projectDir: string): string | null {
  try {
    const require = createRequire(join(projectDir, "noop.js"));
    const pkg = require.resolve("typescript/package.json");
    const bin = join(pkg, "..", "bin", "tsc");
    return existsSync(bin) ? bin : null;
  } catch {
    return null;
  }
}

// run tsc --noEmit against the project tsconfig. skipped when no
// tsconfig or no typescript is present, so js-only projects still build.
export function typecheck(projectDir: string): Promise<TypecheckResult> {
  return new Promise((resolve) => {
    if (!existsSync(join(projectDir, "tsconfig.json"))) {
      resolve({ ran: false, ok: true, reason: "no tsconfig.json", diagnostics: [] });
      return;
    }
    const tsc = projectTsc(projectDir);
    if (tsc === null) {
      resolve({ ran: false, ok: true, reason: "typescript not installed", diagnostics: [] });
      return;
    }
    execFile(
      process.execPath,
      [tsc, "--noEmit", "-p", projectDir],
      { cwd: projectDir, maxBuffer: 1024 * 1024 * 16 },
      (err, stdout, stderr) => {
        const diagnostics = parseDiagnostics(`${stdout}${stderr}`);
        if (err === null) {
          resolve({ ran: true, ok: true, reason: "clean", diagnostics });
          return;
        }
        if (diagnostics.length === 0) {
          resolve({
            ran: true,
            ok: false,
            reason: `${stdout}${stderr}`.trim() || "tsc failed",
            diagnostics,
          });
          return;
        }
        resolve({ ran: true, ok: false, reason: "type errors", diagnostics });
      },
    );
  });
}
