import { stat } from "node:fs/promises";

import { hashBytes, type HashSource } from "./hash.js";
import type { CacheEntry } from "./store.js";

export interface SkipVerdict {
  skip: boolean;
  hash: string;
}

async function existsFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function destFresh(dst: string, srcMtimeMs: number): Promise<boolean> {
  try {
    const info = await stat(dst);
    return info.isFile() && info.mtimeMs >= srcMtimeMs;
  } catch {
    return false;
  }
}

export async function decideSkip(
  prev: CacheEntry | undefined,
  src: string,
  dst: string,
  mode: string,
  clean: boolean,
  hashes: HashSource,
  scanned?: { size: number; mtimeMs: number },
): Promise<SkipVerdict> {
  if (clean) return { skip: false, hash: "" };
  let size = scanned?.size;
  let mtimeMs = scanned?.mtimeMs;
  if (size === undefined || mtimeMs === undefined) {
    const srcStat = await stat(src).catch(() => null);
    if (!srcStat?.isFile()) return { skip: false, hash: "" };
    size = srcStat.size;
    mtimeMs = srcStat.mtimeMs;
  }
  if (!(await existsFile(dst))) return { skip: false, hash: await hashes.hashOf(src) };
  if (
    prev &&
    prev.mode === mode &&
    prev.size === size &&
    prev.mtimeMs === mtimeMs &&
    (await destFresh(dst, mtimeMs))
  ) {
    return { skip: true, hash: prev.hash };
  }
  const current = await hashes.hashOf(src);
  if (current === "") return { skip: false, hash: "" };
  if (prev && prev.hash === current && prev.mode === mode) return { skip: true, hash: current };
  return { skip: false, hash: current };
}

export { hashBytes };
