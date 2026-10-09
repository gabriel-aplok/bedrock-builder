import { runBounded } from "../concurrency.js";
import type { BedrockConfig } from "../config.js";
import { logger } from "../logger.js";
import { BuildCache } from "./cache.js";
import { destRoot } from "./classify.js";
import { customProcessors } from "./extensions.js";
import { loadExtensions } from "./loader.js";
import { defaultProcessors, isFallback } from "./processors/index.js";
import { isUnchanged, processFile } from "./runner.js";
import { collectFiles } from "./scan.js";
import type { FileProcessor, ProcessorContext } from "./types.js";

const FANOUT = 64;

export function resolveProcessors(_config?: BedrockConfig): FileProcessor[] {
  const head = defaultProcessors.filter((stage) => !isFallback(stage));
  const tail = defaultProcessors.filter((stage) => isFallback(stage));
  return [...head, ...customProcessors(), ...tail];
}

export interface PipelineStats {
  processed: number;
  skipped: number;
  prunedFiles: number;
  prunedDirs: number;
}

export interface PipelineRunOptions {
  chain?: readonly FileProcessor[];
  noCache?: boolean;
}

export async function runPipeline(
  config: BedrockConfig,
  ctx: ProcessorContext,
  chain?: readonly FileProcessor[],
  run?: PipelineRunOptions,
): Promise<PipelineStats> {
  if (!run?.chain && !chain) {
    const report = await loadExtensions(config);
    if (report.loaded > 0) logger.debug(`extensions: ${report.loaded} processors ready`);
  }
  const active = run?.chain ?? chain ?? resolveProcessors(config);
  const cache = run?.noCache ? undefined : new BuildCache();
  if (cache) await cache.open(config.out, config.__configDir, false);

  const [bp, rp] = await Promise.all([
    collectFiles(config.packs.bp, destRoot(config, "BP"), "BP", true),
    collectFiles(config.packs.rp, destRoot(config, "RP"), "RP", false),
  ]);

  let processed = 0;
  let skipped = 0;
  await runBounded([...bp, ...rp], FANOUT, async (file) => {
    if (cache) {
      if (await processFile(file, active, ctx, cache)) skipped++;
      else processed++;
      return;
    }
    if (await isUnchanged(file)) {
      skipped++;
      return;
    }
    await processFile(file, active, ctx);
    processed++;
  });

  let prunedFiles = 0;
  let prunedDirs = 0;
  if (cache) {
    await cache.pruneStale();
    await cache.pruneEmptyDirs(destRoot(config, "BP"));
    await cache.pruneEmptyDirs(destRoot(config, "RP"));
    prunedFiles = cache.prunedFiles;
    prunedDirs = cache.prunedDirs;
    await cache.save();
  }
  return { processed, skipped, prunedFiles, prunedDirs };
}

export { destRoot, mapToDest, runPipelineFile } from "./classify.js";
export { isUnchanged, processFile } from "./runner.js";
export { collectFiles } from "./scan.js";
export type { BundleContext, FileProcessor, PipelineFile, ProcessorContext } from "./types.js";
