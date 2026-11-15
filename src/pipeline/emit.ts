import { join, relative } from "node:path";

import type { BedrockConfig } from "../config.js";
import { writeBytes } from "../files/io.js";
import { toPosix } from "../files/tree.js";
import { logger } from "../logger.js";
import { hashBytes } from "./cache/hash.js";
import { ghostKey } from "./cache/store.js";
import type { BuildCache } from "./cache.js";
import { destRoot } from "./classify.js";
import type { EmitFile, FileProcessor, ProcessorContext } from "./types.js";

function why(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// pack relative, no escapes or empties. null means skip the file.
function cleanRel(rel: string): string | null {
  const parts = rel.replace(/\\/g, "/").split("/");
  if (parts.length === 0) return null;
  for (const part of parts) {
    if (part === "" || part === "." || part === "..") return null;
  }
  return parts.join("/");
}

function isEmitFile(value: unknown): value is EmitFile {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    (entry.kind === "BP" || entry.kind === "RP") &&
    typeof entry.rel === "string" &&
    entry.content instanceof Uint8Array
  );
}

async function collectEmitted(
  chain: readonly FileProcessor[],
  ctx: ProcessorContext,
): Promise<EmitFile[]> {
  const out: EmitFile[] = [];
  for (const stage of chain) {
    if (!stage.emit) continue;
    let produced: EmitFile[] | null;
    try {
      produced = await stage.emit(ctx);
    } catch (err) {
      logger.warn(`processor ${stage.name} emit failed: ${why(err)}`);
      continue;
    }
    if (!Array.isArray(produced)) continue;
    for (const file of produced) {
      if (!isEmitFile(file)) {
        logger.warn(`processor ${stage.name} emitted a bad file, skipping`);
        continue;
      }
      out.push(file);
    }
  }
  return out;
}

// write extension-generated files, then prune stale ghosts.
export async function emitOutputs(
  config: BedrockConfig,
  chain: readonly FileProcessor[],
  ctx: ProcessorContext,
  cache: BuildCache | undefined,
  mode: string,
): Promise<number> {
  const emitted = await collectEmitted(chain, ctx);
  const keep = new Set<string>();
  let written = 0;
  for (const file of emitted) {
    const rel = cleanRel(file.rel);
    if (rel === null) {
      logger.warn(`processor emitted a bad path, skipping: ${file.rel}`);
      continue;
    }
    const abs = join(destRoot(config, file.kind), ...rel.split("/"));
    await writeBytes(abs, file.content);
    written++;
    if (cache !== undefined) {
      const out = toPosix(relative(config.__configDir, abs));
      keep.add(ghostKey(out));
      cache.noteEmit(out, hashBytes(file.content), mode, file.content.byteLength);
    }
  }
  if (cache !== undefined) await cache.pruneGhosts(keep);
  return written;
}
