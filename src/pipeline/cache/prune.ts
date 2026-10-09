import { readdir, rmdir, stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

import { runBounded } from "../../concurrency.js";
import { removeEntry } from "../../files/io.js";
import { logger } from "../../logger.js";
import type { CacheEntry } from "./store.js";

const PRUNE_FANOUT = 64;

async function existsFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

export interface PruneResult {
  stale: { key: string; out: string }[];
}

export async function findStale(
  entries: Map<string, CacheEntry>,
  root: string,
): Promise<PruneResult> {
  const gone: { key: string; out: string }[] = [];
  await runBounded([...entries], PRUNE_FANOUT, async ([key]) => {
    if (await existsFile(join(root, ...key.split("/")))) return;
    gone.push({ key, out: entries.get(key)!.out });
  });
  return { stale: gone };
}

export async function removeOutput(root: string, out: string): Promise<void> {
  await removeEntry(join(root, ...out.split("/")));
}

export async function pruneEmptyDirs(root: string, keep: string[] = []): Promise<number> {
  let dirs: string[] = [];
  try {
    dirs = await listDirs(root);
  } catch {
    return 0;
  }
  dirs.sort((a, b) => b.length - a.length);
  let pruned = 0;
  const kept = keep.map((entry) => resolve(entry));
  for (const dir of dirs) {
    const current = resolve(dir);
    if (kept.some((entry) => entry === current || entry.startsWith(current + sep))) continue;
    try {
      if ((await readdir(dir)).length === 0) {
        await rmdir(dir);
        logger.debug(`Pruned empty dir: ${dir}`);
        pruned++;
      }
    } catch {}
  }
  return pruned;
}

async function listDirs(root: string): Promise<string[]> {
  const found: string[] = [];
  async function dive(dir: string): Promise<void> {
    let items;
    try {
      items = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of items) {
      if (!item.isDirectory()) continue;
      const sub = join(dir, item.name);
      found.push(sub);
      await dive(sub);
    }
  }
  await dive(root);
  return found;
}
