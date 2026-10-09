import type { Tree } from "./tree.js";
import { VERSIONS } from "./versions.js";

const GAP = 2;

function dump(obj: unknown): string {
  return `${JSON.stringify(obj, null, GAP)}\n`;
}

function load<T>(tree: Tree, rel: string, seed: T): T {
  const raw = tree.read(rel);
  if (raw === null) return seed;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return seed;
  }
}

function ordered<T extends Record<string, unknown>>(obj: T): T {
  const next: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) next[key] = obj[key];
  return next as T;
}

interface Atlas {
  resource_pack_name?: string;
  texture_name?: string;
  padding?: number;
  num_mip_levels?: number;
  texture_data: Record<string, { textures: string }>;
}

function atlasSlot(file: Atlas): Record<string, { textures: string }> {
  if (!file.texture_data || typeof file.texture_data !== "object") file.texture_data = {};
  return file.texture_data;
}

export function mergeItemTexture(tree: Tree, rp: string, key: string, texturePath: string): void {
  const rel = `${rp}/textures/item_texture.json`;
  const file = load<Atlas>(tree, rel, {
    resource_pack_name: "vanilla",
    texture_name: "atlas.items",
    texture_data: {},
  });
  atlasSlot(file)[key] = { textures: texturePath };
  file.texture_data = ordered(file.texture_data);
  tree.writeMerge(rel, dump(file));
}

export function mergeTerrainTexture(
  tree: Tree,
  rp: string,
  key: string,
  texturePath: string,
): void {
  const rel = `${rp}/textures/terrain_texture.json`;
  const file = load<Atlas>(tree, rel, {
    resource_pack_name: "vanilla",
    texture_name: "atlas.terrain",
    padding: 8,
    num_mip_levels: 0,
    texture_data: {},
  });
  atlasSlot(file)[key] = { textures: texturePath };
  file.texture_data = ordered(file.texture_data);
  tree.writeMerge(rel, dump(file));
}

interface BlocksDoc {
  format_version?: string;
  [id: string]: unknown;
}

export function mergeBlocks(
  tree: Tree,
  rp: string,
  id: string,
  textureKey: string,
  sound: string,
): void {
  const rel = `${rp}/blocks.json`;
  const file = load<BlocksDoc>(tree, rel, {
    format_version: VERSIONS.blocksJson,
  });
  const pinned =
    typeof file.format_version === "string" ? file.format_version : VERSIONS.blocksJson;

  const rows: Record<string, unknown> = {};
  for (const key of Object.keys(file)) {
    if (key !== "format_version") rows[key] = file[key];
  }
  rows[id] = { textures: textureKey, sound };
  tree.writeMerge(rel, dump({ format_version: pinned, ...ordered(rows) }));
}

export function mergeLang(tree: Tree, pack: string, key: string, value: string): void {
  const rel = `${pack}/texts/en_US.lang`;
  const raw = tree.read(rel);
  const lines = raw === null ? [] : raw.split(/\r?\n/);

  let swapped = false;
  const kept: string[] = [];
  for (const line of lines) {
    const cut = line.indexOf("=");
    const head = line.trimStart();
    if (cut === -1 || head.startsWith("#") || head.startsWith("//")) {
      kept.push(line);
      continue;
    }
    if (line.slice(0, cut).trim() === key) {
      kept.push(`${key}=${value}`);
      swapped = true;
    } else {
      kept.push(line);
    }
  }
  if (!swapped) {
    while (kept.length > 0 && kept[kept.length - 1]!.trim() === "") kept.pop();
    kept.push(`${key}=${value}`);
  }
  tree.writeMerge(rel, `${kept.join("\n").replace(/\n*$/, "")}\n`);
}

export function ensureLanguages(tree: Tree, pack: string): void {
  const rel = `${pack}/texts/languages.json`;
  const found = load<string[]>(tree, rel, []);
  const list = Array.isArray(found) ? found : [];
  if (!list.includes("en_US")) list.push("en_US");
  tree.writeMerge(rel, dump(list));
}

interface SoundDoc {
  format_version?: string;
  sound_definitions: Record<string, unknown>;
}

interface BiomesClientDoc {
  biomes: Record<string, unknown>;
}

interface UiDefsDoc {
  ui_defs: string[];
}

export function mergeUiDefs(tree: Tree, rp: string, screenPath: string): boolean {
  const rel = `${rp}/ui/_ui_defs.json`;
  const raw = tree.read(rel);
  if (raw !== null) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return false;
    }
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !Array.isArray((parsed as UiDefsDoc).ui_defs)
    ) {
      return false;
    }
    const doc = parsed as UiDefsDoc;
    if (!doc.ui_defs.includes(screenPath)) doc.ui_defs.push(screenPath);
    doc.ui_defs.sort();
    tree.writeMerge(rel, dump(doc));
    return true;
  }
  tree.writeMerge(rel, dump({ ui_defs: [screenPath] }));
  return true;
}

export function mergeBiomeClient(
  tree: Tree,
  rp: string,
  biome: string,
  waterColor: string,
  fogId: string,
): void {
  const rel = `${rp}/biomes_client.json`;
  const doc = load<BiomesClientDoc>(tree, rel, { biomes: {} });
  const rows = doc.biomes && typeof doc.biomes === "object" ? doc.biomes : {};
  rows[biome] = {
    water_surface_color: waterColor,
    fog_identifier: fogId,
  };
  doc.biomes = ordered(rows);
  tree.writeMerge(rel, dump(doc));
}

export function mergeSoundDefinition(
  tree: Tree,
  rp: string,
  sound: string,
  soundPath: string,
): void {
  const rel = `${rp}/sounds/sound_definitions.json`;
  const doc = load<SoundDoc>(tree, rel, {
    format_version: "1.20.20",
    sound_definitions: {},
  });
  const defs =
    doc.sound_definitions && typeof doc.sound_definitions === "object" ? doc.sound_definitions : {};
  defs[sound] = { category: "neutral", sounds: [{ name: soundPath }] };
  doc.sound_definitions = ordered(defs);
  tree.writeMerge(rel, dump(doc));
}
