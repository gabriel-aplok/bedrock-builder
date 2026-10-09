import { rm } from "node:fs/promises";

import type { BedrockConfig } from "../config.js";
import { logger, printJson } from "../logger.js";
import { BuildCache } from "../pipeline/cache.js";

export interface CleanReport {
  command: "clean";
  ok: boolean;
  out: string;
}

export interface CleanOptions {
  json?: boolean | undefined;
}

export async function clean(
  config: BedrockConfig,
  options: CleanOptions = {},
): Promise<CleanReport> {
  await rm(config.out, { recursive: true, force: true });
  const fresh = new BuildCache();
  await fresh.open(config.out, config.__configDir, true);
  logger.success(`Cleaned ${config.out}`);
  const report: CleanReport = { command: "clean", ok: true, out: config.out };
  if (options.json ?? false) printJson(report);
  return report;
}
