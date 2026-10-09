import { stat } from "node:fs/promises";
import { join, relative } from "node:path";

import { removeEntry } from "../files/io.js";
import { toPosix } from "../files/tree.js";
import { logger } from "../logger.js";
import { decideSkip } from "./cache/decisions.js";
import { MemoHashes } from "./cache/hash.js";
import { findStale, removeOutput, pruneEmptyDirs as sweepEmptyDirs } from "./cache/prune.js";
import { CacheStore, type CacheEntry } from "./cache/store.js";

export type { CacheEntry };

// skips unchanged files by content hash, prunes orphans.
export class BuildCache {
  private store = new CacheStore();
  private hashes = new MemoHashes();
  private root = "";
  private clean = false;

  total = 0;
  skipped = 0;
  processed = 0;
  prunedFiles = 0;
  prunedDirs = 0;

  async open(outDir: string, root: string, clean: boolean): Promise<void> {
    this.hashes.reset();
    this.total = 0;
    this.skipped = 0;
    this.processed = 0;
    this.prunedFiles = 0;
    this.prunedDirs = 0;
    this.root = root;
    this.clean = clean;
    await this.store.load(outDir, clean);
  }

  hashOf(abs: string): Promise<string> {
    return this.hashes.hashOf(abs);
  }

  forget(abs: string): void {
    this.hashes.forget(abs);
  }

  keyOf(abs: string): string {
    return toPosix(relative(this.root, abs));
  }

  async shouldSkip(
    src: string,
    dst: string,
    mode: string,
    scanned?: { size: number; mtimeMs: number },
  ): Promise<{ skip: boolean; hash: string }> {
    this.total++;
    this.forget(src);
    const verdict = await decideSkip(
      this.store.entries.get(this.keyOf(src)),
      src,
      dst,
      mode,
      this.clean,
      this.hashes,
      scanned,
    );
    if (verdict.skip) this.skipped++;
    else this.processed++;
    return verdict;
  }

  note(src: string, dst: string, hash: string, mode: string, size: number, mtimeMs: number): void {
    if (hash === "") return;
    this.store.entries.set(this.keyOf(src), {
      hash,
      mode,
      out: toPosix(relative(this.root, dst)),
      size,
      mtimeMs,
    });
    this.store.dirty = true;
  }

  async drop(src: string): Promise<void> {
    this.forget(src);
    const key = this.keyOf(src);
    const entry = this.store.entries.get(key);
    if (entry) {
      await removeOutput(this.root, entry.out);
      this.store.entries.delete(key);
      this.store.dirty = true;
    }
    const prefix = `${key.replace(/\/$/, "")}/`;
    for (const other of [...this.store.entries.keys()]) {
      if (!other.startsWith(prefix)) continue;
      const gone = this.store.entries.get(other)!;
      await removeOutput(this.root, gone.out);
      this.store.entries.delete(other);
      this.store.dirty = true;
    }
  }

  async pruneStale(): Promise<void> {
    if (this.clean || this.store.entries.size === 0) return;
    const { stale } = await findStale(this.store.entries, this.root);
    for (const { key, out } of stale) {
      await removeEntry(join(this.root, ...out.split("/")));
      logger.debug(`Pruned stale output: ${out}`);
      this.store.entries.delete(key);
      this.prunedFiles++;
      this.store.dirty = true;
    }
  }

  async pruneEmptyDirs(root: string): Promise<void> {
    this.prunedDirs += await sweepEmptyDirs(root);
  }

  async save(): Promise<void> {
    await this.store.save();
  }

  get size(): number {
    return this.store.entries.size;
  }

  // read-only copy of the loaded entries, for diff without a build.
  snapshot(): Map<string, CacheEntry> {
    return new Map(this.store.entries);
  }

  // drop in-memory state without saving, for read-only commands.
  async discard(): Promise<void> {
    this.store.dirty = false;
  }

  static async outputExists(path: string): Promise<boolean> {
    try {
      return (await stat(path)).isFile();
    } catch {
      return false;
    }
  }
}
