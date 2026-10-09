import { rm } from "node:fs/promises";
import { relative } from "node:path";

import { buildBundle, buildBundleWithWatch } from "../bundler.js";
import type { BedrockConfig } from "../config.js";
import { logger } from "../logger.js";
import { mapToDest } from "../pipeline/classify.js";
import type { FileProcessor } from "../pipeline/index.js";
import { resolveProcessors, runPipeline, runPipelineFile } from "../pipeline/index.js";
import { loadExtensions } from "../pipeline/loader.js";
import { watchTypes } from "../typewatch.js";
import {
  createPackWatcher,
  SaveBatcher,
  timestamp,
  waitForReady,
  type WatchEvent,
} from "../watcher.js";

export interface WatchOptions {
  // run tsc --watch alongside the rebuilds. on by default when a tsconfig exists.
  types?: boolean;
  // external stop signal. resolves waitForSignal when it fires.
  // lets hosts stop watch without sending a process signal.
  stop?: AbortSignal | undefined;
}

export interface WatchSession {
  done: Promise<void>;
  stop(): void;
}

export function startWatch(config: BedrockConfig, options: WatchOptions = {}): WatchSession {
  const stopper = new AbortController();
  const done = watch(config, { ...options, stop: stopper.signal });
  return {
    done,
    stop() {
      stopper.abort();
    },
  };
}

export async function watch(config: BedrockConfig, options: WatchOptions = {}): Promise<void> {
  logger.info("Building (watch, dev)...");
  await loadExtensions(config);
  const chain = resolveProcessors(config);
  const started = Date.now();
  const first = await buildBundle(config, { release: false });
  await runPipeline(config, { release: false }, chain);
  logger.success(`Initial build in ${Date.now() - started}ms (bundle ${first.elapsedMs}ms)`);

  const types = (options.types ?? true) ? watchTypes(config.__configDir) : null;

  const bundler = await buildBundleWithWatch(config, { release: false }, (result) => {
    logger.success(`[${timestamp()}] Rebuilt scripts in ${result.elapsedMs}ms`);
  });

  const watcher = await createPackWatcher(config);
  const batch = new SaveBatcher((files) => {
    void mirrorSavedFiles(config, files, chain);
  });
  watcher.on("add", (file: string) => batch.push(file, "add"));
  watcher.on("change", (file: string) => batch.push(file, "change"));
  watcher.on("unlink", (file: string) => void dropFile(config, file));
  watcher.on("error", (err: unknown) => {
    logger.warn(`watcher error: ${err instanceof Error ? err.message : String(err)}`);
  });
  await waitForReady(watcher);

  logger.info(`Watching ${config.packs.bp} and ${config.packs.rp} for changes...`);
  logger.info("Press Ctrl+C to stop.");
  await waitForSignal(options.stop);

  logger.info("Shutting down watcher...");
  types?.stop();
  await bundler.dispose().catch((err: unknown) => {
    logger.warn(`bundler dispose: ${err instanceof Error ? err.message : String(err)}`);
  });
  await watcher.close().catch((err: unknown) => {
    logger.warn(`watcher close: ${err instanceof Error ? err.message : String(err)}`);
  });
}

async function mirrorSavedFiles(
  config: BedrockConfig,
  files: Map<string, WatchEvent>,
  chain: readonly FileProcessor[],
): Promise<void> {
  let done = 0;
  for (const [file, event] of files) {
    const rel = relative(config.__configDir, file);
    logger.debug(`watch ${event}: ${rel}`);
    try {
      const mirrored = await runPipelineFile(config, file, { release: false }, chain);
      if (mirrored) {
        done++;
        logger.debug(`watch mirrored: ${rel}`);
      } else {
        logger.debug(`watch skipped: ${rel}`);
      }
    } catch (err) {
      logger.warn(`failed to mirror ${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (done === 0) return;
  const [first, ...rest] = [...files.keys()].map((file) => relative(config.__configDir, file));
  const extra = rest.length > 0 ? ` (+${rest.length} more)` : "";
  logger.success(`[${timestamp()}] updated ${done} file${done === 1 ? "" : "s"}: ${first}${extra}`);
}

async function dropFile(config: BedrockConfig, file: string): Promise<void> {
  try {
    const mapped = mapToDest(config, file);
    if (mapped === null) return;
    await rm(mapped.dst, { force: true });
    logger.success(`[${timestamp()}] removed ${relative(config.__configDir, file)}`);
  } catch (err) {
    logger.warn(
      `failed to remove mirror for ${file}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function waitForSignal(stop?: AbortSignal): Promise<void> {
  if (stop?.aborted) return Promise.resolve();
  return new Promise<void>((wake) => {
    const done = () => {
      stop?.removeEventListener("abort", done);
      process.off("SIGINT", done);
      process.off("SIGTERM", done);
      wake();
    };
    stop?.addEventListener("abort", done, { once: true });
    process.once("SIGINT", done);
    process.once("SIGTERM", done);
  });
}
