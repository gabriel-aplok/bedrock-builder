import { readFile, stat } from "node:fs/promises";

import { writeBytes } from "../files/io.js";
import { logger } from "../logger.js";
import type { BuildCache } from "./cache.js";
import type { FileProcessor, PipelineFile, ProcessorContext } from "./types.js";

function why(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const destLocks = new Map<string, Promise<void>>();

export async function processFile(
  file: PipelineFile,
  chain: readonly FileProcessor[],
  ctx: ProcessorContext,
  cache?: BuildCache,
): Promise<boolean> {
  const mapped = remapFile(file, chain);
  const mode = ctx.release ? "release" : "dev";
  if (cache) {
    const { skip, hash } = await cache.shouldSkip(mapped.src, mapped.dst, mode, {
      size: mapped.size,
      mtimeMs: mapped.mtimeMs,
    });
    if (skip) return true;
    await writeLocked(mapped, chain, ctx);
    const fresh = await stat(mapped.src).catch(() => null);
    cache.note(
      mapped.src,
      mapped.dst,
      hash === "" ? await cache.hashOf(mapped.src) : hash,
      mode,
      fresh?.size ?? mapped.size,
      fresh?.mtimeMs ?? mapped.mtimeMs,
    );
    return false;
  }
  await writeLocked(mapped, chain, ctx);
  return false;
}

function remapFile(file: PipelineFile, chain: readonly FileProcessor[]): PipelineFile {
  for (const stage of chain) {
    if (!stage.remap) continue;
    let match = false;
    try {
      match = stage.match(file);
    } catch (err) {
      logger.warn(`processor ${stage.name} match failed on ${file.rel}: ${why(err)}`);
      continue;
    }
    if (!match) continue;
    try {
      const dst = stage.remap(file);
      if (dst !== null && dst !== file.dst) return { ...file, dst };
      return file;
    } catch (err) {
      logger.warn(`processor ${stage.name} remap failed on ${file.rel}: ${why(err)}`);
      return file;
    }
  }
  return file;
}

async function writeLocked(
  file: PipelineFile,
  chain: readonly FileProcessor[],
  ctx: ProcessorContext,
): Promise<void> {
  const prev = destLocks.get(file.dst) ?? Promise.resolve();
  let free!: () => void;
  const mine = new Promise<void>((wake) => {
    free = wake;
  });
  destLocks.set(
    file.dst,
    prev.then(() => mine).catch(() => undefined),
  );
  await prev.catch(() => undefined);
  try {
    await runChain(file, chain, ctx);
  } finally {
    free();
    if (destLocks.get(file.dst) === mine) destLocks.delete(file.dst);
  }
}

async function runChain(
  file: PipelineFile,
  chain: readonly FileProcessor[],
  ctx: ProcessorContext,
): Promise<void> {
  const active = chain.filter((stage) => {
    try {
      return stage.match(file);
    } catch (err) {
      logger.warn(`processor ${stage.name} match failed on ${file.rel}: ${why(err)}`);
      return false;
    }
  });

  for (const stage of active) {
    if (!stage.pre) continue;
    try {
      await stage.pre(file, ctx);
    } catch (err) {
      logger.warn(`processor ${stage.name} pre failed on ${file.rel}: ${why(err)}`);
    }
  }

  let bytes: Uint8Array;
  try {
    bytes = await readFile(file.src);
  } catch (err) {
    logger.warn(`cannot read ${file.rel}: ${why(err)}`);
    return;
  }

  for (const stage of active) {
    if (!stage.transform) continue;
    try {
      const next = await stage.transform(bytes, file, ctx);
      if (next !== null) bytes = next;
    } catch (err) {
      logger.warn(`processor ${stage.name} failed on ${file.rel}: ${why(err)}`);
    }
  }

  try {
    await writeBytes(file.dst, bytes);
  } catch (err) {
    logger.warn(`cannot write ${file.rel}: ${why(err)}`);
    return;
  }

  for (const stage of active) {
    if (!stage.post) continue;
    try {
      await stage.post(file, ctx);
    } catch (err) {
      logger.warn(`processor ${stage.name} post failed on ${file.rel}: ${why(err)}`);
    }
  }
}

export async function isUnchanged(file: PipelineFile): Promise<boolean> {
  const prev = await stat(file.dst).catch(() => null);
  return !!prev && prev.size === file.size && prev.mtimeMs >= file.mtimeMs;
}
