import { mkdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

import * as p from "@clack/prompts";
import pc from "../colors.js";

import type { BedrockConfig } from "../config.js";

export interface FolderDef {
  subpath: string;
  hint: string;
}

export const BP_FOLDERS: FolderDef[] = [
  {
    subpath: "animation_controllers",
    hint: "Server-side animation controllers",
  },
  { subpath: "animations", hint: "Server-side animations" },
  { subpath: "biomes", hint: "Custom biome definitions" },
  { subpath: "blocks", hint: "Custom block behavior" },
  { subpath: "cameras/presets", hint: "Camera preset JSON" },
  { subpath: "dialogue", hint: "NPC dialogue trees" },
  { subpath: "entities", hint: "Server entity definitions (plural)" },
  { subpath: "feature_rules", hint: "World-gen feature placement rules" },
  { subpath: "features", hint: "World-gen feature definitions" },
  { subpath: "functions", hint: ".mcfunction files" },
  { subpath: "item_catalog", hint: "Creative inventory groups" },
  { subpath: "items", hint: "Custom item behavior" },
  { subpath: "loot_tables", hint: "Loot table definitions" },
  { subpath: "recipes", hint: "Crafting and smelting recipes" },
  { subpath: "spawn_rules", hint: "Where mobs spawn" },
  { subpath: "structures", hint: ".mcstructure files" },
  { subpath: "texts", hint: "Localization (languages.json + en_US.lang)" },
  { subpath: "trading", hint: "Villager trade tables" },
  { subpath: "voxel_shapes", hint: "Custom block shapes" },
];

export const RP_FOLDERS: FolderDef[] = [
  {
    subpath: "animation_controllers",
    hint: "Client-side animation controllers",
  },
  { subpath: "animations", hint: "Client-side animations" },
  {
    subpath: "attachables",
    hint: "Items rendered on the player (held / worn)",
  },
  { subpath: "atmospherics", hint: "Sky and atmosphere settings" },
  { subpath: "biomes", hint: "Client biome visuals" },
  { subpath: "block_culling", hint: "Block face culling rules" },
  { subpath: "color_grading", hint: "Color grading volumes" },
  { subpath: "entity", hint: "Client entity definitions (singular)" },
  { subpath: "fogs", hint: "Custom fog definitions" },
  { subpath: "font", hint: "Custom UI fonts" },
  { subpath: "lighting", hint: "Custom lighting settings" },
  { subpath: "materials", hint: "Custom rendering materials" },
  { subpath: "models/entity", hint: "Entity geometry .geo.json (singular)" },
  { subpath: "models/blocks", hint: "Block geometry .geo.json" },
  { subpath: "particles", hint: "Particle effect definitions" },
  { subpath: "pbr", hint: "Physically based rendering setup" },
  { subpath: "point_lights", hint: "Point light definitions" },
  {
    subpath: "render_controllers",
    hint: "Render controllers (geometry + materials per state)",
  },
  { subpath: "shadows", hint: "Shadow configuration" },
  {
    subpath: "sounds",
    hint: "Sound files (referenced by sound_definitions.json)",
  },
  { subpath: "texts", hint: "Localization (languages.json + en_US.lang)" },
  { subpath: "textures/blocks", hint: "Block textures" },
  { subpath: "textures/entity", hint: "Entity textures (singular)" },
  { subpath: "textures/items", hint: "Item textures" },
  { subpath: "ui", hint: "Custom UI definitions (advanced)" },
  { subpath: "water", hint: "Water appearance settings" },
];

export interface FolderOption {
  value: string;
  label: string;
  hint: string;
  existing: boolean;
}

async function present(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function displayPath(configDir: string, abs: string): string {
  return relative(configDir, abs).replace(/\\/g, "/");
}

async function toOptions(
  root: string,
  base: string,
  defs: readonly FolderDef[],
): Promise<FolderOption[]> {
  return Promise.all(
    defs.map(async (def): Promise<FolderOption> => {
      const value = join(root, ...def.subpath.split("/"));
      const existing = await present(value);
      const shown = displayPath(base, value);
      return {
        value,
        label: existing ? `${shown} ${pc.dim("(exists)")}` : shown,
        hint: def.hint,
        existing,
      };
    }),
  );
}

export async function listFolderOptions(
  config: BedrockConfig,
): Promise<{ bp: FolderOption[]; rp: FolderOption[] }> {
  const [bp, rp] = await Promise.all([
    toOptions(config.packs.bp, config.__configDir, BP_FOLDERS),
    toOptions(config.packs.rp, config.__configDir, RP_FOLDERS),
  ]);
  return { bp, rp };
}

export async function createFolders(
  paths: readonly string[],
): Promise<{ created: number; alreadyExisted: number }> {
  let created = 0;
  let alreadyExisted = 0;
  for (const dir of paths) {
    if (await present(dir)) {
      alreadyExisted++;
      continue;
    }
    await mkdir(dir, { recursive: true });
    created++;
  }
  return { created, alreadyExisted };
}

async function pickMany(message: string, options: FolderOption[]): Promise<string[] | null> {
  const picked = await p.multiselect({
    message,
    options: options.map(({ value, label, hint }) => ({ value, label, hint })),
    required: false,
  });
  if (p.isCancel(picked)) {
    p.cancel("Cancelled.");
    return null;
  }
  return picked as string[];
}

export async function folders(config: BedrockConfig): Promise<void> {
  p.intro(pc.bgCyan(pc.black(" bb folders ")));
  const opts = await listFolderOptions(config);

  const bpRoot = displayPath(config.__configDir, config.packs.bp) || ".";
  const rpRoot = displayPath(config.__configDir, config.packs.rp) || ".";
  const bpPicked = await pickMany(`Behavior pack folders  ${pc.dim(`(${bpRoot}/)`)}`, opts.bp);
  if (bpPicked === null) return;
  const rpPicked = await pickMany(`Resource pack folders  ${pc.dim(`(${rpRoot}/)`)}`, opts.rp);
  if (rpPicked === null) return;

  const picked = [...bpPicked, ...rpPicked];
  if (picked.length === 0) {
    p.outro("Nothing selected.");
    return;
  }

  const { created, alreadyExisted } = await createFolders(picked);
  const summary = [pc.green(`${created} created`)];
  if (alreadyExisted > 0) summary.push(pc.dim(`${alreadyExisted} already existed`));
  p.outro(summary.join(", "));
}
