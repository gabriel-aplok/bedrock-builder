import { relative, sep } from "node:path";

import { listTree, type TreeEntry } from "../files/tree.js";

export interface StatsRow {
  path: string;
  bytes: number;
}

export interface BuildStats {
  // total bytes under dist, excluding the cache and mcaddons.
  totalBytes: number;
  // bytes of the bundled entry.
  bundleBytes: number;
  // file count under dist, same scope as totalBytes.
  fileCount: number;
  // ten biggest output files, dist-relative.
  biggest: StatsRow[];
}

const TOP_FILES = 10;

function countable(rel: string): boolean {
  const path = rel.toLowerCase();
  if (path === ".builder-cache.json") return false;
  if (path.endsWith(".mcaddon")) return false;
  return true;
}

// walk dist after a build, summing bytes and ranking the biggest files.
export async function collectBuildStats(out: string, bundlePath: string): Promise<BuildStats> {
  const entries: TreeEntry[] = await listTree(out);
  const rows: StatsRow[] = [];
  let totalBytes = 0;
  for (const entry of entries) {
    if (!countable(entry.rel)) continue;
    totalBytes += entry.size;
    rows.push({ path: entry.rel, bytes: entry.size });
  }
  rows.sort((a, b) => b.bytes - a.bytes);

  let bundleBytes = 0;
  try {
    const bundleRel = entryRel(out, bundlePath);
    const hit = rows.find((row) => row.path === bundleRel);
    if (hit !== undefined) bundleBytes = hit.bytes;
  } catch {
    bundleBytes = 0;
  }

  return {
    totalBytes,
    bundleBytes,
    fileCount: rows.length,
    biggest: rows.slice(0, TOP_FILES),
  };
}

function entryRel(out: string, abs: string): string {
  return relative(out, abs).split(sep).join("/");
}
