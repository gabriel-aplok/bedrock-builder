import { resolve } from "node:path";

import type { BedrockConfig } from "../config.js";
import { harnessCheck } from "../harness/check.js";
import { logger, printJson } from "../logger.js";
import { build } from "./build.js";

export interface HarnessOptions {
  // build first. Defaults to true.
  build?: boolean | undefined;
  // extra warnings become failures: missing pack icons, unused lang keys.
  strict?: boolean | undefined;
  json?: boolean | undefined;
}

export interface HarnessReport {
  command: "harness";
  ok: boolean;
  out: string;
  files: number;
  jsonFiles: number;
  failures: string[];
}

export class HarnessError extends Error {
  readonly exitCode = 11;
  constructor(message: string) {
    super(message);
    this.name = "HarnessError";
  }
}

// load the built dist and cross-check every reference. fails on any finding.
export async function harness(
  config: BedrockConfig,
  options: HarnessOptions = {},
): Promise<HarnessReport> {
  if (options.build ?? true) {
    await build(config, { release: false, clean: false });
  }
  const out = resolve(config.out);
  const result = await harnessCheck(out, { strict: options.strict ?? false });
  const failures = result.failures.map((f) => f.message);

  const report: HarnessReport = {
    command: "harness",
    ok: failures.length === 0,
    out,
    files: result.files,
    jsonFiles: result.jsonFiles,
    failures,
  };
  if (options.json ?? false) {
    printJson(report);
  } else if (failures.length === 0) {
    logger.success(
      `Harness passed: ${result.files} files, ${result.jsonFiles} json, no broken links`,
    );
  } else {
    for (const message of failures.slice(0, 20)) {
      logger.error(`harness: ${message}`);
    }
    if (failures.length > 20) {
      logger.error(`harness: ... and ${failures.length - 20} more`);
    }
  }
  if (failures.length > 0) {
    throw new HarnessError(`${failures.length} harness finding(s) in ${out}`);
  }
  return report;
}
