import { stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import type { BedrockConfig } from "../config.js";
import { toPosix } from "../files/tree.js";
import { processFile } from "./runner.js";
import type { FileProcessor, PipelineFile, ProcessorContext } from "./types.js";

export function destRoot(config: BedrockConfig, kind: "BP" | "RP"): string {
  return join(config.out, "packs", kind);
}

export function isTopLevelScripts(rel: string): boolean {
  if (rel === "scripts" || rel === "scripts/") return true;
  const cut = rel.search(/[\\/]/);
  return cut === -1 ? rel === "scripts" : rel.slice(0, cut) === "scripts";
}

function under(root: string, abs: string): string | null {
  const rel = relative(root, abs);
  if (!rel || rel.startsWith("..")) return null;
  return rel;
}

export function mapToDest(
  config: BedrockConfig,
  changed: string,
): { src: string; dst: string; rel: string; kind: "BP" | "RP" } | null {
  const abs = resolve(changed);
  const bp = under(config.packs.bp, abs);
  if (bp !== null) {
    if (isTopLevelScripts(bp)) return null;
    return {
      src: abs,
      dst: join(destRoot(config, "BP"), bp),
      rel: toPosix(bp),
      kind: "BP",
    };
  }
  const rp = under(config.packs.rp, abs);
  if (rp !== null) {
    return {
      src: abs,
      dst: join(destRoot(config, "RP"), rp),
      rel: toPosix(rp),
      kind: "RP",
    };
  }
  return null;
}

async function withStats(
  src: string,
  dst: string,
  rel: string,
  kind: "BP" | "RP",
): Promise<PipelineFile | null> {
  const info = await stat(src).catch(() => null);
  if (!info?.isFile()) return null;
  return { src, dst, rel, kind, size: info.size, mtimeMs: info.mtimeMs };
}

export async function classifyPath(
  config: BedrockConfig,
  changed: string,
): Promise<PipelineFile | null> {
  const spot = mapToDest(config, changed);
  if (!spot) return null;
  return withStats(spot.src, spot.dst, spot.rel, spot.kind);
}

export async function runPipelineFile(
  config: BedrockConfig,
  changed: string,
  ctx: ProcessorContext,
  chain: readonly FileProcessor[],
): Promise<boolean> {
  const file = await classifyPath(config, changed);
  if (!file) return false;
  await processFile(file, chain, ctx);
  return true;
}
