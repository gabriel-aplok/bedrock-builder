import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { runBounded } from "./concurrency.js";
import { copyEntry, removeEntry } from "./files/io.js";
import { listTree } from "./files/tree.js";

const FANOUT = 64;

export async function syncTree(from: string, into: string): Promise<void> {
  const fresh = new Map((await listTree(from)).map((e) => [e.rel, e]));
  const stale = new Map((await listTree(into)).map((e) => [e.rel, e]));
  await mkdir(into, { recursive: true });

  const copies: { src: string; dst: string }[] = [];
  for (const [rel, next] of fresh) {
    const prev = stale.get(rel);
    if (!prev || prev.size !== next.size || next.mtimeMs > prev.mtimeMs) {
      copies.push({ src: next.abs, dst: join(into, ...rel.split("/")) });
    }
  }

  const removals: string[] = [];
  for (const rel of stale.keys()) {
    if (!fresh.has(rel)) removals.push(join(into, ...rel.split("/")));
  }

  await runBounded(copies, FANOUT, (job) => copyEntry(job.src, job.dst));
  await runBounded(removals, FANOUT, (gone) => removeEntry(gone));
}
