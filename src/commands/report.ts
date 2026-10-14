import { readFile } from "node:fs/promises";
import { relative } from "node:path";

import type { BedrockConfig } from "../config.js";
import { listTree } from "../files/tree.js";
import { pngSize } from "../harness/check.js";
import { parseJsonc } from "../jsonc.js";
import { logger, printJson } from "../logger.js";

export interface ReportDuplicate {
  id: string;
  files: string[];
}

export interface ReportOversized {
  path: string;
  bytes: number;
}

export interface ReportTexture {
  path: string;
  width: number;
  height: number;
}

export interface ReportSide {
  files: number;
  bytes: number;
  // content counts by top-level key, for example entity, item, recipe.
  kinds: Record<string, number>;
}

export interface HealthReport {
  command: "report";
  ok: boolean;
  root: string;
  files: number;
  jsonFiles: number;
  bytes: number;
  bp: ReportSide;
  rp: ReportSide;
  duplicates: ReportDuplicate[];
  invalid: string[];
  oversized: ReportOversized[];
  // textures with an edge over the limit.
  textures: ReportTexture[];
}

export interface ReportOptions {
  // flag files at or above this size. Defaults to 1 MiB.
  maxBytes?: number | undefined;
  // flag textures with an edge above this. Defaults to 1024.
  maxTextureEdge?: number | undefined;
  json?: boolean | undefined;
}

export const DEFAULT_MAX_BYTES = 1048576;
export const DEFAULT_MAX_TEXTURE_EDGE = 1024;

function emptySide(): ReportSide {
  return { files: 0, bytes: 0, kinds: {} };
}

// read-only pack health scan; never writes or throws on content issues.
export async function report(
  config: BedrockConfig,
  options: ReportOptions = {},
): Promise<HealthReport> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxEdge = options.maxTextureEdge ?? DEFAULT_MAX_TEXTURE_EDGE;
  const sides = [
    { dir: config.packs.bp, tag: "BP", side: emptySide() },
    { dir: config.packs.rp, tag: "RP", side: emptySide() },
  ];

  let files = 0;
  let jsonFiles = 0;
  let bytes = 0;
  const defined = new Map<string, Set<string>>();
  const invalid: string[] = [];
  const oversized: ReportOversized[] = [];
  const textures: ReportTexture[] = [];

  for (const { dir, tag, side } of sides) {
    const entries = await listTree(dir);
    for (const entry of entries) {
      files++;
      side.files++;
      bytes += entry.size;
      side.bytes += entry.size;
      const rel = `${tag}/${relative(dir, entry.abs).replace(/\\/g, "/")}`;
      if (entry.size >= maxBytes) oversized.push({ path: rel, bytes: entry.size });
      if (entry.rel.endsWith(".png")) {
        const raw = await readFile(entry.abs);
        const size = pngSize(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength));
        if (size && (size.width > maxEdge || size.height > maxEdge)) {
          textures.push({ path: rel, ...size });
        }
      }
      if (!entry.rel.endsWith(".json")) continue;
      jsonFiles++;
      let doc: unknown;
      try {
        doc = parseJsonc(await readFile(entry.abs, "utf8"));
      } catch {
        invalid.push(rel);
        continue;
      }
      if (typeof doc !== "object" || doc === null) continue;
      for (const [top, body] of Object.entries(doc as Record<string, unknown>)) {
        if (!top.startsWith("minecraft:")) continue;
        const kind = top.slice("minecraft:".length);
        side.kinds[kind] = (side.kinds[kind] ?? 0) + 1;
        if (typeof body !== "object" || body === null) continue;
        const desc = (body as Record<string, unknown>).description;
        if (typeof desc !== "object" || desc === null) continue;
        const id = (desc as Record<string, unknown>).identifier;
        if (typeof id !== "string" || id === "") continue;
        if (!defined.has(id)) defined.set(id, new Set());
        defined.get(id)!.add(rel);
      }
    }
  }

  const duplicates: ReportDuplicate[] = [];
  for (const [id, owners] of defined) {
    if (owners.size > 1) duplicates.push({ id, files: [...owners].sort() });
  }
  duplicates.sort((a, b) => (a.id < b.id ? -1 : 1));
  oversized.sort((a, b) => b.bytes - a.bytes);

  const result: HealthReport = {
    command: "report",
    ok: true,
    root: config.__configDir,
    files,
    jsonFiles,
    bytes,
    bp: sides[0]!.side,
    rp: sides[1]!.side,
    duplicates,
    invalid,
    oversized,
    textures,
  };
  if (options.json ?? false) {
    printJson(result);
  } else {
    logger.info(`pack report: ${files} files, ${jsonFiles} json, ${bytes} bytes`);
    for (const [tag, side] of [
      ["BP", result.bp],
      ["RP", result.rp],
    ] as const) {
      const kinds = Object.entries(side.kinds)
        .map(([kind, count]) => `${kind} ${count}`)
        .join(", ");
      logger.info(`  ${tag}: ${side.files} files${kinds === "" ? "" : ` (${kinds})`}`);
    }
    for (const row of duplicates) logger.info(`  duplicate ${row.id} in ${row.files.join(", ")}`);
    for (const path of invalid) logger.info(`  invalid json ${path}`);
    for (const row of oversized) logger.info(`  oversized ${row.path} (${row.bytes} bytes)`);
    for (const row of textures)
      logger.info(`  large texture ${row.path} (${row.width}x${row.height})`);
  }
  return result;
}
