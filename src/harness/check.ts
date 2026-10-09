import { readFile } from "node:fs/promises";

import { listTree } from "../files/tree.js";

export interface HarnessFailure {
  // dist-relative path plus what is wrong.
  message: string;
}

export interface HarnessReport {
  files: number;
  jsonFiles: number;
  failures: HarnessFailure[];
}

function collectIds(value: unknown, bucket: string[], depth = 0): void {
  if (depth > 12 || value === null || value === undefined) return;
  if (typeof value === "string") {
    if (/^[a-z0-9_]+:[a-z0-9_/.-]+$/i.test(value)) bucket.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectIds(item, bucket, depth + 1);
    return;
  }
  if (typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) {
      collectIds(item, bucket, depth + 1);
    }
  }
}

export interface HarnessOptions {
  // extra warnings become failures: missing pack icons, unused lang keys.
  strict?: boolean | undefined;
}

// load a built dist, parse every json, and cross-check references.
// returns failures, empty means the pack is internally consistent.
// strict adds pack icon presence plus unused lang key findings.
export async function harnessCheck(
  out: string,
  options: HarnessOptions = {},
): Promise<HarnessReport> {
  const entries = await listTree(out);
  const failures: HarnessFailure[] = [];
  const fail = (message: string) => failures.push({ message });

  const jsonDocs = new Map<string, unknown>();
  let jsonFiles = 0;
  for (const entry of entries) {
    if (!entry.rel.endsWith(".json")) continue;
    jsonFiles++;
    try {
      const raw = await readFile(entry.abs, "utf8");
      jsonDocs.set(entry.rel, JSON.parse(raw));
    } catch (err) {
      fail(`${entry.rel}: invalid json (${err instanceof Error ? err.message : String(err)})`);
    }
  }

  const bpRoot = "packs/BP/";
  const rpRoot = "packs/RP/";
  const hasBp = entries.some((e) => e.rel.startsWith(bpRoot));
  const hasRp = entries.some((e) => e.rel.startsWith(rpRoot));
  if (!hasBp) fail("missing packs/BP/ in dist");
  if (!hasRp) fail("missing packs/RP/ in dist");

  // defined identifiers per pack side.
  const defined = new Map<string, Set<string>>();
  const define = (side: string, id: string) => {
    if (!defined.has(side)) defined.set(side, new Set());
    defined.get(side)!.add(id);
  };

  for (const [rel, doc] of jsonDocs) {
    if (typeof doc !== "object" || doc === null) continue;
    const record = doc as Record<string, unknown>;
    for (const [top, body] of Object.entries(record)) {
      if (!top.startsWith("minecraft:")) continue;
      if (typeof body !== "object" || body === null) continue;
      const desc = (body as Record<string, unknown>).description;
      if (typeof desc !== "object" || desc === null) continue;
      const id = (desc as Record<string, unknown>).identifier;
      if (typeof id !== "string" || id === "") continue;
      const side = rel.startsWith(bpRoot) ? "bp" : rel.startsWith(rpRoot) ? "rp" : "other";
      define(`${side}:${top}`, id);
      define(side, id);
    }
  }

  // every texture and geometry reference must resolve to a file.
  const files = new Set(entries.map((e) => e.rel));
  for (const [rel, doc] of jsonDocs) {
    const refs: string[] = [];
    collectIds(doc, refs);
    for (const id of refs) {
      if (id.startsWith("minecraft:")) continue;
      const [ns, ...rest] = id.split(":");
      const tail = rest.join(":");
      if (ns === undefined || tail === "") continue;
      if (tail.includes("/") || tail.includes(".")) {
        const base = rel.startsWith(bpRoot) ? bpRoot : rel.startsWith(rpRoot) ? rpRoot : null;
        if (base === null) continue;
        const candidates = [
          `${base}${tail}`,
          `${base}${tail}.png`,
          `${base}${tail}.json`,
          `${base}${tail}.geo.json`,
        ];
        if (!candidates.some((c) => files.has(c))) {
          // only flag texture and geometry paths, not data ids.
          if (
            tail.startsWith("textures/") ||
            tail.startsWith("models/") ||
            tail.startsWith("geometry.")
          ) {
            if (!tail.startsWith("geometry.")) {
              fail(`${rel}: missing file for "${id}"`);
            }
          }
        }
      }
    }
  }

  // item icon keys must exist in the atlases.
  const atlasKeys = new Set<string>();
  for (const [rel, doc] of jsonDocs) {
    if (!rel.endsWith("item_texture.json") && !rel.endsWith("terrain_texture.json")) continue;
    if (typeof doc !== "object" || doc === null) continue;
    const data = (doc as Record<string, unknown>).texture_data;
    if (typeof data !== "object" || data === null) continue;
    for (const key of Object.keys(data as Record<string, unknown>)) {
      atlasKeys.add(key);
    }
  }
  for (const [rel, doc] of jsonDocs) {
    if (typeof doc !== "object" || doc === null) continue;
    const item = (doc as Record<string, unknown>)["minecraft:item"];
    if (typeof item !== "object" || item === null) continue;
    const components = (item as Record<string, unknown>).components;
    if (typeof components !== "object" || components === null) continue;
    const icon = (components as Record<string, unknown>)["minecraft:icon"];
    if (typeof icon !== "string") continue;
    const terrain = rel.includes("/blocks/");
    if (!terrain && !atlasKeys.has(icon)) {
      fail(`${rel}: icon "${icon}" has no item_texture.json entry`);
    }
  }

  // block material textures must exist in terrain_texture.json.
  for (const [rel, doc] of jsonDocs) {
    if (typeof doc !== "object" || doc === null) continue;
    const block = (doc as Record<string, unknown>)["minecraft:block"];
    if (typeof block !== "object" || block === null) continue;
    const components = (block as Record<string, unknown>).components;
    if (typeof components !== "object" || components === null) continue;
    const instances = (components as Record<string, unknown>)["minecraft:material_instances"];
    if (typeof instances !== "object" || instances === null) continue;
    for (const slot of Object.values(instances as Record<string, unknown>)) {
      if (typeof slot !== "object" || slot === null) continue;
      const texture = (slot as Record<string, unknown>).texture;
      if (typeof texture !== "string") continue;
      if (!atlasKeys.has(texture)) {
        fail(`${rel}: texture "${texture}" has no terrain_texture.json entry`);
      }
    }
  }

  // spawn rule identifiers should match a defined entity.
  const entities = new Set<string>();
  for (const [rel, doc] of jsonDocs) {
    if (!rel.includes("/entities/")) continue;
    if (typeof doc !== "object" || doc === null) continue;
    const entity = (doc as Record<string, unknown>)["minecraft:entity"];
    if (typeof entity !== "object" || entity === null) continue;
    const desc = (entity as Record<string, unknown>).description;
    if (typeof desc !== "object" || desc === null) continue;
    const id = (desc as Record<string, unknown>).identifier;
    if (typeof id === "string" && id !== "") entities.add(id);
  }
  for (const [rel, doc] of jsonDocs) {
    if (!rel.includes("spawn_rules/")) continue;
    if (typeof doc !== "object" || doc === null) continue;
    const rules = (doc as Record<string, unknown>)["minecraft:spawn_rules"];
    if (typeof rules !== "object" || rules === null) continue;
    const desc = (rules as Record<string, unknown>).description;
    if (typeof desc !== "object" || desc === null) continue;
    const id = (desc as Record<string, unknown>).identifier;
    if (typeof id !== "string") continue;
    if (!entities.has(id)) {
      fail(`${rel}: spawn rule for unknown entity "${id}"`);
    }
  }

  // recipe and feature identifiers must be unique across the pack.
  const seen = new Map<string, string>();
  for (const [rel, doc] of jsonDocs) {
    if (typeof doc !== "object" || doc === null) continue;
    const record = doc as Record<string, unknown>;
    const recipe =
      record["minecraft:recipe_shapeless"] ??
      record["minecraft:recipe_shaped"] ??
      record["minecraft:recipe_furnace"];
    if (typeof recipe === "object" && recipe !== null) {
      const desc = (recipe as Record<string, unknown>).description;
      if (typeof desc === "object" && desc !== null) {
        const id = (desc as Record<string, unknown>).identifier;
        if (typeof id === "string" && id !== "") {
          const first = seen.get(`recipe:${id}`);
          if (first !== undefined) {
            fail(`${rel}: duplicate recipe "${id}", first in ${first}`);
          } else {
            seen.set(`recipe:${id}`, rel);
          }
        }
      }
    }
  }

  // strict only: each pack dir needs its icon, every lang key needs a user.
  if (options.strict ?? false) {
    const strictFindings = await checkStrict(entries, jsonDocs);
    for (const message of strictFindings) fail(message);
  }

  return { files: entries.length, jsonFiles, failures };
}

// missing pack icons plus lang keys that nothing references.
async function checkStrict(
  entries: { rel: string; abs: string }[],
  jsonDocs: Map<string, unknown>,
): Promise<string[]> {
  const findings: string[] = [];
  const files = new Set(entries.map((e) => e.rel));
  for (const pack of ["packs/BP", "packs/RP"]) {
    if (!files.has(`${pack}/pack_icon.png`)) {
      findings.push(`${pack}/pack_icon.png: missing pack icon`);
    }
  }

  const langKeys = new Map<string, string>();
  for (const entry of entries) {
    if (!entry.rel.endsWith(".lang")) continue;
    const raw = await readFile(entry.abs, "utf8").catch(() => "");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (trimmed === "" || trimmed.startsWith("#")) continue;
      const cut = trimmed.indexOf("=");
      if (cut <= 0) continue;
      langKeys.set(trimmed.slice(0, cut).trim(), entry.rel);
    }
  }
  if (langKeys.size === 0) return findings;

  const used = new Set<string>();
  for (const [, doc] of jsonDocs) {
    collectStrings(doc, used);
  }
  for (const key of langKeys.keys()) {
    if (!used.has(key)) findings.push(`${langKeys.get(key)}: unused lang key "${key}"`);
  }
  return findings;
}

// every string leaf, for lang key usage checks.
function collectStrings(value: unknown, bucket: Set<string>): void {
  if (typeof value === "string") {
    bucket.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, bucket);
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const item of Object.values(value as Record<string, unknown>)) {
      collectStrings(item, bucket);
    }
  }
}
