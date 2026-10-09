import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import { logger } from "./logger.js";
import { timestamp } from "./watcher.js";

export interface TypeWatcher {
  stop(): void;
}

// resolve the project's own typescript, same rule as the one-shot typecheck.
function projectTsc(projectDir: string): string | null {
  try {
    const require = createRequire(join(projectDir, "noop.js"));
    const pkg = require.resolve("typescript/package.json");
    return join(pkg, "..", "bin", "tsc");
  } catch {
    return null;
  }
}

// run tsc --watch in the background, forwarding each error line once.
// silent when the project has no tsconfig or no typescript.
export function watchTypes(projectDir: string): TypeWatcher | null {
  if (!existsSync(join(projectDir, "tsconfig.json"))) return null;
  const tsc = projectTsc(projectDir);
  if (tsc === null) return null;

  const child: ChildProcess = spawn(
    process.execPath,
    [tsc, "--watch", "--noEmit", "--pretty", "false", "-p", projectDir],
    { cwd: projectDir, shell: false },
  );

  let buffer = "";
  const seen = new Set<string>();
  const flush = (chunk: Buffer | string) => {
    buffer += String(chunk);
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === "" || trimmed.startsWith("Found ")) continue;
      if (!trimmed.includes("error TS")) continue;
      if (seen.has(trimmed)) continue;
      seen.add(trimmed);
      if (seen.size > 200) seen.clear();
      logger.error(`[${timestamp()}] ${trimmed}`);
    }
  };
  child.stdout?.on("data", flush);
  child.stderr?.on("data", flush);
  child.on("error", (err) => {
    logger.warn(`type watcher failed: ${err.message}`);
  });

  logger.info("Type errors will print on save (tsc --watch).");
  return {
    stop() {
      child.kill();
    },
  };
}
