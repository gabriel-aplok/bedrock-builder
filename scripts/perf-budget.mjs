import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TEST_BUDGET_MS = 120_000;
const SHIP_BUDGET_MS = 60_000;

function npmCmd() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function timed(label, file, args) {
  const start = Date.now();
  execFileSync(file, args, { stdio: "inherit", shell: false });
  const ms = Date.now() - start;
  console.log(`perf: ${label} ${ms}ms`);
  return ms;
}

const testMs = timed("tests", npmCmd(), ["test"]);
if (testMs > TEST_BUDGET_MS) {
  console.error(`perf: test budget ${TEST_BUDGET_MS}ms exceeded`);
  process.exit(1);
}

const scratch = mkdtempSync(join(tmpdir(), "bb-perf-"));
try {
  const shipMs = timed("fixture ship", process.execPath, [
    "dist/cli.js",
    "ship",
    "-c",
    "test/fixtures/basic-addon/bedrock.config.json",
    "--output",
    join(scratch, "perf.mcaddon"),
  ]);
  if (shipMs > SHIP_BUDGET_MS) {
    console.error(`perf: ship budget ${SHIP_BUDGET_MS}ms exceeded`);
    process.exit(1);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
