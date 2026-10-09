import { readFile, rm, writeFile } from "node:fs/promises";

import { collectBuildStats, type BuildStats } from "../build/stats.js";
import { buildBundle } from "../bundler.js";
import type { BedrockConfig } from "../config.js";
import { logger, printJson } from "../logger.js";
import { BuildCache } from "../pipeline/cache.js";
import { runBundleHooks } from "../pipeline/extensions.js";
import { runPipeline } from "../pipeline/index.js";
import { loadExtensions } from "../pipeline/loader.js";
import { typecheck, TypecheckError } from "../typecheck.js";

export interface BuildOptions {
  release?: boolean;
  clean?: boolean;
  json?: boolean;
  typecheck?: boolean;
  stats?: boolean;
}

export interface BuildReport {
  command: "build";
  ok: boolean;
  release: boolean;
  totalMs: number;
  bundleMs: number;
  bundlePath: string;
  packsWritten: number;
  packsCached: number;
  prunedFiles: number;
  prunedDirs: number;
  stats?: BuildStats | undefined;
}

export async function build(
  config: BedrockConfig,
  options: BuildOptions = {},
): Promise<BuildReport> {
  const release = options.release ?? false;
  const started = Date.now();
  logger.info(release ? "Building (release)..." : "Building...");

  if (options.typecheck ?? false) {
    const checked = await typecheck(config.__configDir);
    if (!checked.ran) {
      logger.debug(`Typecheck skipped: ${checked.reason}`);
    } else if (!checked.ok) {
      throw new TypecheckError(checked.diagnostics, checked.reason);
    } else {
      logger.debug("Typecheck passed");
    }
  }

  if (options.clean ?? false) {
    logger.debug(`Cleaning ${config.out}`);
    await rm(config.out, { recursive: true, force: true });
    const fresh = new BuildCache();
    await fresh.open(config.out, config.__configDir, true);
  }

  await loadExtensions(config);

  const [bundle, packs] = await Promise.all([
    buildBundle(config, { release }),
    runPipeline(config, { release }),
  ]);
  const bundleBytes = await readFile(bundle.outputPath);
  const optimized = await runBundleHooks(bundleBytes, {
    release,
    outputPath: bundle.outputPath,
  });
  if (optimized !== bundleBytes) await writeFile(bundle.outputPath, optimized);
  const totalMs = Date.now() - started;
  logger.debug(`Bundled ${config.entry} into ${bundle.outputPath} in ${bundle.elapsedMs}ms`);
  const cacheNote =
    packs.prunedFiles > 0 || packs.prunedDirs > 0
      ? `, pruned ${packs.prunedFiles} files/${packs.prunedDirs} dirs`
      : "";
  logger.debug(`Packs: ${packs.processed} written, ${packs.skipped} cached${cacheNote}`);
  logger.debug(
    `Perf: total ${totalMs}ms, bundle ${bundle.elapsedMs}ms, packs written ${packs.processed}, cached ${packs.skipped}`,
  );

  logger.success(`Built in ${totalMs}ms (bundle ${bundle.elapsedMs}ms)`);
  const report: BuildReport = {
    command: "build",
    ok: true,
    release,
    totalMs,
    bundleMs: bundle.elapsedMs,
    bundlePath: bundle.outputPath,
    packsWritten: packs.processed,
    packsCached: packs.skipped,
    prunedFiles: packs.prunedFiles,
    prunedDirs: packs.prunedDirs,
  };
  if (options.stats ?? false) {
    const stats = await collectBuildStats(config.out, bundle.outputPath);
    report.stats = stats;
    if (options.json ?? false) {
      printJson(report);
      return report;
    }
    printStats(stats);
    return report;
  }
  if (options.json ?? false) printJson(report);
  return report;
}

// human lines: total, bundle, count, then the ranked file list.
function printStats(stats: BuildStats): void {
  logger.info(
    `Stats: ${prettySize(stats.totalBytes)} in ${stats.fileCount} files, bundle ${prettySize(stats.bundleBytes)}`,
  );
  for (const row of stats.biggest) {
    logger.info(`  ${prettySize(row.bytes).padStart(9)}  ${row.path}`);
  }
}

function prettySize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
