import pc from "../colors.js";
import * as p from "../prompts.js";

import type { BedrockConfig } from "../config.js";
import { validateName } from "../generate/core/identifier.js";
import { toDisplayName } from "../generate/core/names.js";
import { CREATE_TYPES, type CreateOptions, type CreateType } from "../generate/core/types.js";

export class AbortError extends Error {
  constructor() {
    super("Cancelled.");
    this.name = "AbortError";
  }
}

export function isKnownType(value: string): value is CreateType {
  return (CREATE_TYPES as readonly string[]).includes(value);
}

export async function askOptions(
  config: BedrockConfig,
  opts: CreateOptions,
): Promise<CreateOptions> {
  p.intro(pc.bgCyan(pc.black(" bb new ")));

  let type = opts.type;
  if (!type || !isKnownType(type)) {
    const picked = await p.select({
      message: "What do you want to create?",
      options: CREATE_TYPES.map((t) => ({ value: t as string, label: t })),
    });
    if (p.isCancel(picked)) abort();
    type = picked as CreateType;
  }

  const raw = opts.name?.trim() ?? "";
  const name = raw !== "" ? raw : await askName();
  const out: CreateOptions = { ...opts, type, name };

  switch (type) {
    case "weapon":
      await askWeapon(out, config, name);
      break;
    case "tool":
      await askTool(out, name);
      break;
    case "armor":
      await askArmor(out, config, name);
      break;
    case "item":
      out.icon ??= await askLine("Icon name", name);
      out.displayName ??= await askLine("Display name", toDisplayName(name));
      break;
    case "entity":
      await askEntity(out, config, name);
      break;
    case "block":
      await askBlock(out, name);
      break;
    case "recipe":
      await askRecipe(out, config, name);
      break;
    case "loot":
      await askLoot(out, config, name);
      break;
    case "loot_table":
      out.lootKind ??= await askChoice("Table folder", ["entity", "block", "chest"], "chest");
      out.pools ??= await askCount("Pools", 3);
      break;
    case "spawn":
      out.spawnCategory ??= await askChoice(
        "Category",
        ["animal", "monster", "ambient", "water"],
        "animal",
      );
      out.weight ??= await askCount("Weight", 10);
      out.min ??= await askCount("Herd min", 1);
      out.max ??= await askCount("Herd max", 2);
      break;
    case "trade":
      out.want ??= await askLine("Want id", "minecraft:emerald");
      out.give ??= await askLine("Give id", `${config.namespace}:${name}`);
      out.min ??= await askCount("Want min", 1);
      out.max ??= await askCount("Want max", 1);
      break;
    case "dialogue":
      out.dialogueText ??= await askLine("NPC text", `Hello, I am ${name}.`);
      out.dialogueButton ??= await askLine("Button", "Close");
      break;
    case "animation":
      out.animation ??= await askLine("Animation id", `${name}.idle`);
      break;
    case "equipment":
      out.result ??= await askLine("Drop id", `${config.namespace}:${name}`);
      out.rolls ??= await askCount("Chance percent", 100);
      break;
    case "feature":
      out.result ??= await askLine("Places block", "minecraft:diamond_ore");
      out.count ??= await askCount("Count", 10);
      break;
    case "feature_rule":
      out.result ??= await askLine("Places feature", `${config.namespace}:${name}`);
      out.count ??= await askCount("Iterations", 1);
      out.min ??= await askCount("Y level", 90);
      break;
    case "particle":
      out.texture ??= await askLine("Texture", "textures/particle/particles");
      break;
    case "fog":
      out.color ??= await askLine("Fog color", "#14A2C5");
      out.min ??= await askCount("Fog start", 0);
      out.max ??= await askCount("Fog end", 60);
      break;
    case "function":
      out.commandLine ??= await askLine("Command", "say hello");
      break;
    case "voxel_shape":
      out.count ??= await askCount("Max Y (1-16)", 16);
      break;
    case "biome":
      out.color ??= await askLine("Water color", "#14A2C5");
      out.fog ??= await askLine("Fog id", `minecraft:fog_${name}`);
      break;
    case "camera":
      out.x ??= await askCount("pos_x", 0);
      out.y ??= await askCount("pos_y", 0);
      out.z ??= await askCount("pos_z", 0);
      break;
    case "item_catalog":
      out.category ??= await askChoice(
        "Category",
        ["construction", "equipment", "items", "nature"],
        "items",
      );
      out.group ??= await askLine("Group name", `${config.namespace}:${name}`);
      out.result ??= await askLine("Item id", `${config.namespace}:${name}`);
      break;
    case "sound":
      out.result ??= await askLine("Sound event id", `${config.namespace}.${name}`);
      out.soundFile ??= await askLine("Sound path", `sounds/${name}`);
      break;
    case "biomes_client":
      out.color ??= await askLine("Water color", "#44AFF5");
      out.fog ??= await askLine("Fog id", `minecraft:fog_${name}`);
      break;
    case "block_culling":
      out.direction ??= await askChoice(
        "Direction",
        ["up", "down", "north", "south", "east", "west"],
        "up",
      );
      break;
    case "dimension":
      out.min ??= await askCount("Min Y", -64);
      out.count ??= await askCount("Height range", 384);
      break;
    case "ui":
      break;
  }
  return out;
}

async function askWeapon(out: CreateOptions, config: BedrockConfig, name: string): Promise<void> {
  out.mode ??= await askChoice("Render", ["2d", "3d"], "2d");
  out.icon ??= await askLine("Icon name", name);
  if ((out.mode ?? "2d").toLowerCase() === "3d") {
    out.geometry ??= await askLine("Geometry id", `geometry.${config.namespace}.${name}`);
    out.texture ??= await askLine("Texture path", `textures/${config.namespace}/items/${name}`);
  }
}

async function askTool(out: CreateOptions, name: string): Promise<void> {
  out.variant ??= await askChoice("Tool type", ["pickaxe", "axe", "shovel", "hoe"]);
  out.icon ??= await askLine("Icon name", name);
  out.tier ??= await askChoice("Tier", ["wooden", "stone", "iron", "golden", "diamond"], "diamond");
}

async function askArmor(out: CreateOptions, config: BedrockConfig, name: string): Promise<void> {
  out.piece ??= await askChoice("Piece", ["helmet", "chestplate", "leggings", "boots"]);
  out.mode ??= await askChoice("Render mode", ["icon", "3d"], "icon");
  out.icon ??= await askLine("Icon name", name);
  if ((out.mode ?? "icon").toLowerCase() === "3d") {
    out.geometry ??= await askLine("Geometry id", `geometry.${config.namespace}.${name}`);
    out.texture ??= await askLine("Texture path", `textures/${config.namespace}/models/${name}`);
  }
}

async function askEntity(out: CreateOptions, config: BedrockConfig, name: string): Promise<void> {
  out.mode ??= await askChoice("Render", ["2d", "3d"], "3d");
  out.spawnEgg ??= await askConfirm("Write a spawn egg item?", true);
  out.displayName ??= await askLine("Display name", toDisplayName(name));
  out.texture ??= await askLine("Texture path", `textures/entity/${name}`);
  if ((out.mode ?? "3d").toLowerCase() === "3d") {
    out.geometry ??= await askLine("Geometry id", `geometry.${config.namespace}.${name}`);
  }
}

async function askBlock(out: CreateOptions, name: string): Promise<void> {
  out.texture ??= await askLine("Texture key", name);
  out.renderMethod ??= await askChoice(
    "Render method",
    ["opaque", "blend", "alpha_test"],
    "opaque",
  );
  out.sound ??= await askChoice(
    "Sound",
    ["stone", "wood", "glass", "metal", "sand", "gravel"],
    "stone",
  );
  await askCompanions(out);
}

async function askRecipe(out: CreateOptions, config: BedrockConfig, name: string): Promise<void> {
  out.recipeKind ??= await askChoice(
    "Recipe kind",
    ["shapeless", "shaped", "furnace"],
    "shapeless",
  );
  out.result ??= await askLine("Result id", `${config.namespace}:${name}`);
  const kind = (out.recipeKind ?? "shapeless").toLowerCase();
  if (kind === "furnace") {
    out.ingredients ??= await askLine("Input id", "minecraft:cobblestone");
  } else if (kind === "shaped") {
    out.pattern ??= await askLine("Pattern rows", "XXX; # ; # ");
    out.recipeKey ??= await askLine("Key map", "X=minecraft:planks,#=minecraft:stick");
  } else {
    out.ingredients ??= await askLine("Ingredient ids", "minecraft:stick");
  }
  out.count ??= await askCount("Result count", 1);
  out.unlock ??= await askLine("Unlock (item id or context:name, blank for default)", "");
}

async function askLoot(out: CreateOptions, config: BedrockConfig, name: string): Promise<void> {
  out.lootKind ??= await askChoice("Loot kind", ["entity", "block", "chest"], "entity");
  out.result ??= await askLine("Drop id", `${config.namespace}:${name}`);
  out.rolls ??= await askCount("Pool rolls", 1);
  out.min ??= await askCount("Drop min", 0);
  out.max ??= await askCount("Drop max", 1);
}

async function askCompanions(out: CreateOptions): Promise<void> {
  if (out.recipe === undefined && out.loot === undefined) {
    const picked = await p.multiselect({
      message: "Also generate",
      options: [
        { value: "recipe", label: "recipe" },
        { value: "loot", label: "loot" },
      ],
      required: false,
    });
    if (p.isCancel(picked)) abort();
    const list = picked as string[];
    if (list.includes("recipe")) {
      out.recipe ??= await askChoice(
        "Recipe kind",
        ["shapeless", "shaped", "furnace"],
        "shapeless",
      );
    }
    if (list.includes("loot")) {
      out.loot ??= await askChoice("Loot kind", ["entity", "block", "chest"], "entity");
    }
    return;
  }
  if (out.recipe !== undefined && out.recipe.trim() === "") out.recipe = "shapeless";
  if (out.loot !== undefined && out.loot.trim() === "") out.loot = "entity";
}

async function askCount(message: string, fallback: number): Promise<number> {
  const value = await p.text({
    message,
    defaultValue: String(fallback),
    placeholder: String(fallback),
  });
  if (p.isCancel(value)) abort();
  const text = (value as string).trim();
  const n = Number(text === "" ? fallback : text);
  if (!Number.isInteger(n) || n < 0) {
    p.log.warn("Needs an integer >= 0. Using the default.");
    return fallback;
  }
  return n;
}

function abort(): never {
  p.cancel("Cancelled.");
  throw new AbortError();
}

async function askName(): Promise<string> {
  const value = await p.text({
    message: "Name (snake_case)",
    placeholder: "fire_sword",
    validate: (text) => {
      const ok = validateName((text ?? "").trim());
      return ok === true ? undefined : ok;
    },
  });
  if (p.isCancel(value)) abort();
  return (value as string).trim();
}

async function askLine(message: string, fallback: string): Promise<string> {
  const value = await p.text({
    message,
    defaultValue: fallback,
    placeholder: fallback,
  });
  if (p.isCancel(value)) abort();
  const text = (value as string).trim();
  return text === "" ? fallback : text;
}

async function askChoice(message: string, options: string[], initial?: string): Promise<string> {
  const value = await p.select({
    message,
    options: options.map((item) => ({ value: item, label: item })),
    initialValue: initial,
  });
  if (p.isCancel(value)) abort();
  return value as string;
}

async function askConfirm(message: string, initial = true): Promise<boolean> {
  const value = await p.confirm({ message, initialValue: initial });
  if (p.isCancel(value)) abort();
  return value as boolean;
}
