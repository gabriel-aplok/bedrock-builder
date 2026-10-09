import { copyFile, mkdir, rm } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

import { buildBundleWithWatch } from "../bundler.js";
import type { BedrockConfig } from "../config.js";
import { logger } from "../logger.js";
import { resolveDeployTarget, type DeployTargets } from "../paths.js";
import { mapToDest } from "../pipeline/classify.js";
import { resolveProcessors, runPipelineFile, type FileProcessor } from "../pipeline/index.js";
import { loadExtensions } from "../pipeline/loader.js";
import { syncTree } from "../sync.js";
import { watchTypes } from "../typewatch.js";
import {
  createPackWatcher,
  SaveBatcher,
  timestamp,
  waitForReady,
  type WatchEvent,
} from "../watcher.js";
import { build } from "./build.js";

export interface DeployOptions {
  release?: boolean;
  watch?: boolean;
  types?: boolean;
  // external stop signal for watch mode. lets hosts stop without signals.
  stop?: AbortSignal | undefined;
}

export interface DeploySession {
  done: Promise<void>;
  stop(): void;
}

export function startDeployWatch(
  config: BedrockConfig,
  options: Omit<DeployOptions, "watch"> = {},
): DeploySession {
  const stopper = new AbortController();
  const done = deploy(config, {
    ...options,
    watch: true,
    stop: stopper.signal,
  });
  return {
    done,
    stop() {
      stopper.abort();
    },
  };
}

function targetPath(targets: DeployTargets, kind: "BP" | "RP", rel: string): string {
  return join(kind === "BP" ? targets.bp : targets.rp, ...rel.split("/"));
}

async function pushDist(config: BedrockConfig, targets: DeployTargets): Promise<void> {
  await Promise.all([
    syncTree(join(config.out, "packs", "BP"), targets.bp),
    syncTree(join(config.out, "packs", "RP"), targets.rp),
  ]);
}

export async function deploy(config: BedrockConfig, options: DeployOptions = {}): Promise<void> {
  const release = options.release ?? false;
  await build(config, { release, clean: false });

  const targets = await resolveDeployTarget(config);
  logger.info(`Deploying to ${targets.root}`);
  await pushDist(config, targets);
  logger.success(`Deployed ${config.name} into ${targets.bp} and ${targets.rp}`);

  if (!(options.watch ?? false)) return;
  logger.info(
    `Watching ${config.packs.bp} and ${config.packs.rp} for changes (run --watch${release ? " --release" : ""})...`,
  );
  await loadExtensions(config);
  const chain = resolveProcessors(config);
  const types = (options.types ?? true) ? watchTypes(config.__configDir) : null;

  const bundler = await buildBundleWithWatch(config, { release }, async (result) => {
    try {
      const main = join(targets.bp, "scripts", "main.js");
      await mkdir(dirname(main), { recursive: true });
      await copyFile(result.outputPath, main);
      logger.success(`[${timestamp()}] Rebuilt + deployed scripts in ${result.elapsedMs}ms`);
    } catch (err) {
      logger.warn(`failed to deploy bundle: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  const watcher = await createPackWatcher(config);
  const batch = new SaveBatcher((files) => {
    void deploySavedFiles(config, targets, files, release, chain);
  });
  watcher.on("add", (file: string) => batch.push(file, "add"));
  watcher.on("change", (file: string) => batch.push(file, "change"));
  watcher.on("unlink", (file: string) => void dropTarget(config, targets, file));
  watcher.on("error", (err: unknown) => {
    logger.warn(`watcher error: ${err instanceof Error ? err.message : String(err)}`);
  });
  await waitForReady(watcher);

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

async function deploySavedFiles(
  config: BedrockConfig,
  targets: DeployTargets,
  files: Map<string, WatchEvent>,
  release: boolean,
  chain: readonly FileProcessor[],
): Promise<void> {
  let done = 0;
  for (const [file, event] of files) {
    const rel = relative(config.__configDir, file);
    logger.debug(`watch ${event}: ${rel}`);
    try {
      if (!(await runPipelineFile(config, file, { release }, chain))) {
        logger.debug(`watch skipped: ${rel}`);
        continue;
      }
      const mapped = mapToDest(config, file);
      if (!mapped) {
        logger.debug(`watch unmapped: ${rel}`);
        continue;
      }
      const dest = targetPath(targets, mapped.kind, mapped.rel);
      await mkdir(dirname(dest), { recursive: true });
      await copyFile(mapped.dst, dest);
      done++;
      logger.debug(`watch deployed: ${rel}`);
    } catch (err) {
      logger.warn(`failed to mirror ${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (done === 0) return;
  const [first, ...rest] = [...files.keys()].map((file) => relative(config.__configDir, file));
  const extra = rest.length > 0 ? ` (+${rest.length} more)` : "";
  logger.success(
    `[${timestamp()}] deployed ${done} file${done === 1 ? "" : "s"}: ${first}${extra} into target`,
  );
}

async function dropTarget(
  config: BedrockConfig,
  targets: DeployTargets,
  file: string,
): Promise<void> {
  try {
    const mapped = mapToDest(config, file);
    if (!mapped) return;
    await rm(targetPath(targets, mapped.kind, mapped.rel), { force: true });
    logger.success(`[${timestamp()}] removed ${relative(config.__configDir, file)} from target`);
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
