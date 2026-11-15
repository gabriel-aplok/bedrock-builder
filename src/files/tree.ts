import { readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import { runBounded } from "../concurrency.js";

const TREE_FANOUT = 32;

export interface TreeEntry {
  rel: string;
  abs: string;
  size: number;
  mtimeMs: number;
}

export function toPosix(path: string): string {
  return path.split(sep).join("/");
}

export async function listTree(root: string): Promise<TreeEntry[]> {
  const found: TreeEntry[] = [];
  await dive(root, root, found);
  return found;
}

async function dive(root: string, dir: string, found: TreeEntry[]): Promise<void> {
  let items;
  try {
    items = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  const subs: string[] = [];
  const files: string[] = [];
  for (const item of items) {
    if (item.isDirectory()) subs.push(join(dir, item.name));
    else files.push(item.name);
  }
  await runBounded(subs, TREE_FANOUT, (sub) => dive(root, sub, found));
  const stats = await Promise.all(
    files.map(async (name) => ({
      name,
      info: await stat(join(dir, name)).catch(() => null),
    })),
  );
  for (const { name, info } of stats) {
    if (!info?.isFile()) continue;
    const abs = join(dir, name);
    found.push({
      rel: toPosix(relative(root, abs)),
      abs,
      size: info.size,
      mtimeMs: info.mtimeMs,
    });
  }
}
