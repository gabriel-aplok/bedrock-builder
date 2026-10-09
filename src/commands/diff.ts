import { stat } from "node:fs/promises";
import { join } from "node:path";

import pc from "picocolors";
import type { BedrockConfig } from "../config.js";
import { toPosix } from "../files/tree.js";
import { logger, printJson } from "../logger.js";
import { BuildCache } from "../pipeline/cache.js";
import { MemoHashes } from "../pipeline/cache/hash.js";
import { destRoot } from "../pipeline/classify.js";
import { collectFiles } from "../pipeline/scan.js";

export type DiffStatus = "added" | "modified" | "deleted";

export interface DiffRow {
  status: DiffStatus;
  path: string;
}

export interface DiffReport {
  command: "diff";
  ok: boolean;
  added: number;
  modified: number;
  deleted: number;
  files: DiffRow[];
}

export interface DiffOptions {
  json?: boolean | undefined;
}

async function existsFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

// compare current sources against the last build cache.
// added: source with no cache entry. modified: hash differs.
// deleted: cache entry whose source vanished.
export async function diff(config: BedrockConfig, options: DiffOptions = {}): Promise<DiffReport> {
  const cache = new BuildCache();
  await cache.open(config.out, config.__configDir, false);
  const entries = cache.snapshot();
  await cache.discard();

  const hashes = new MemoHashes();
  const [bp, rp] = await Promise.all([
    collectFiles(config.packs.bp, destRoot(config, "BP"), "BP", true),
    collectFiles(config.packs.rp, destRoot(config, "RP"), "RP", false),
  ]);
  const seen = new Set<string>();
  const rows: DiffRow[] = [];

  for (const file of [...bp, ...rp]) {
    const key = cache.keyOf(file.src);
    seen.add(key);
    const prev = entries.get(key);
    if (!prev) {
      rows.push({ status: "added", path: toPosix(file.rel) });
      continue;
    }
    if (!(await existsFile(file.dst))) {
      rows.push({ status: "modified", path: toPosix(file.rel) });
      continue;
    }
    const current = await hashes.hashOf(file.src);
    if (current !== "" && current !== prev.hash) {
      rows.push({ status: "modified", path: toPosix(file.rel) });
    }
  }
  for (const [key] of entries) {
    if (seen.has(key)) continue;
    const abs = join(config.__configDir, ...key.split("/"));
    if (await existsFile(abs)) {
      rows.push({ status: "modified", path: key });
    } else {
      rows.push({ status: "deleted", path: key });
    }
  }

  rows.sort((a, b) => (a.path < b.path ? -1 : 1));
  const added = rows.filter((r) => r.status === "added").length;
  const modified = rows.filter((r) => r.status === "modified").length;
  const deleted = rows.filter((r) => r.status === "deleted").length;
  const report: DiffReport = {
    command: "diff",
    ok: true,
    added,
    modified,
    deleted,
    files: rows,
  };
  if (options.json ?? false) {
    printJson(report);
    return report;
  }
  if (rows.length === 0) {
    logger.success("No changes since the last build");
    return report;
  }
  for (const row of rows) {
    const word =
      row.status === "added"
        ? pc.green(row.status)
        : row.status === "modified"
          ? pc.yellow(row.status)
          : pc.red(row.status);
    logger.info(`${word}  ${row.path}`);
  }
  logger.info(`${added} added, ${modified} modified, ${deleted} deleted`);
  return report;
}
