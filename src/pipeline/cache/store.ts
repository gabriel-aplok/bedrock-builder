import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { logger } from "../../logger.js";

export interface CacheEntry {
  hash: string;
  mode: string;
  out: string;
  size: number;
  mtimeMs: number;
}

export const CACHE_FILENAME = ".builder-cache.json";

export class CacheStore {
  entries = new Map<string, CacheEntry>();
  file = "";
  dirty = false;

  reset(file: string): void {
    this.entries.clear();
    this.file = file;
    this.dirty = false;
  }

  async load(outDir: string, clean: boolean): Promise<void> {
    this.reset(join(outDir, CACHE_FILENAME));
    if (clean) {
      await rm(this.file, { force: true }).catch(() => undefined);
      return;
    }
    let text: string;
    try {
      text = await readFile(this.file, "utf8");
    } catch {
      return;
    }
    try {
      const parsed = JSON.parse(text) as Record<string, CacheEntry>;
      for (const [key, entry] of Object.entries(parsed)) {
        if (typeof entry?.hash !== "string" || typeof entry?.out !== "string") continue;
        this.entries.set(key, {
          hash: entry.hash,
          mode: entry.mode ?? "",
          out: entry.out,
          size: entry.size ?? -1,
          mtimeMs: entry.mtimeMs ?? -1,
        });
      }
      logger.debug(`Cache loaded with ${this.entries.size} entries.`);
    } catch (err) {
      logger.warn(
        `Bad cache file, starting fresh: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async save(): Promise<void> {
    if (this.file === "" || !this.dirty) return;
    try {
      await mkdir(dirname(this.file), { recursive: true });
      const flat: Record<string, CacheEntry> = {};
      for (const [key, entry] of [...this.entries].sort(([a], [b]) => (a < b ? -1 : 1))) {
        flat[key] = entry;
      }
      await writeFile(this.file, `${JSON.stringify(flat, null, 2)}\n`, "utf8");
      this.dirty = false;
    } catch (err) {
      logger.warn(`Cannot save cache: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
