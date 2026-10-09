import type { BedrockConfig } from "../config.js";
import { GenerateError } from "./core/errors.js";
import { openPlan } from "./core/setup.js";
import type { Tree } from "./core/tree.js";
import type { CreateOptions, GeneratorResult } from "./core/types.js";
import { renderRecipeJson } from "./templates/recipe.js";

const FURNACE_TAGS = new Set(["furnace", "blast_furnace", "smoker", "campfire", "soul_campfire"]);

function parseRecipeKind(raw: string): "shapeless" | "shaped" | "furnace" {
  const kind = raw.toLowerCase();
  if (kind === "shapeless" || kind === "shaped" || kind === "furnace") return kind;
  throw new GenerateError(`Unknown recipe kind "${raw}". Pick shapeless, shaped, or furnace.`);
}

function parseOutputCount(raw: number | undefined, fallback: number): number {
  const count = raw ?? fallback;
  if (!Number.isInteger(count) || count < 1) {
    throw new GenerateError(`Recipe count must be a positive integer, got ${raw}.`);
  }
  return count;
}

function parseNamespacedId(raw: string, field: string): string {
  const id = raw.trim();
  if (id === "" || !id.includes(":")) {
    throw new GenerateError(`${field} must be a namespaced id like "minecraft:stick".`);
  }
  return id;
}

function parseIngredientIds(raw: string | undefined): string[] {
  const list = (raw ?? "minecraft:stick")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "")
    .map((item) => parseNamespacedId(item, "ingredients"));
  if (list.length === 0) throw new GenerateError("ingredients needs at least one item id.");
  return list;
}

// pattern rows separated by ";", for example "XXX; # ; # ".
// key entries as "A=minecraft:stick", comma separated.
function parsePattern(raw: string | undefined): string[] {
  const rows = (raw ?? "XXX; # ; # ").split(";");
  if (rows.length < 1 || rows.length > 3) {
    throw new GenerateError(`pattern needs 1 to 3 rows, got ${rows.length}.`);
  }
  for (const row of rows) {
    if (row.length < 1 || row.length > 3) {
      throw new GenerateError(`each pattern row needs 1 to 3 symbols, got "${row}".`);
    }
  }
  return rows;
}

function parseRecipeKey(raw: string | undefined, pattern: string[]): Record<string, string> {
  const key: Record<string, string> = {};
  const entries = (raw ?? "X=minecraft:stick").split(",").map((e) => e.trim());
  for (const entry of entries) {
    const cut = entry.indexOf("=");
    if (cut < 1 || cut !== 1) {
      throw new GenerateError(`key entries look like "X=minecraft:stick", got "${entry}".`);
    }
    const symbol = entry.slice(0, 1);
    const item = parseNamespacedId(entry.slice(2), "key");
    key[symbol] = item;
  }
  const used = new Set(pattern.join("").replace(/ /g, "").split(""));
  for (const symbol of used) {
    if (!(symbol in key)) {
      throw new GenerateError(`pattern uses "${symbol}" but key has no entry for it.`);
    }
  }
  return key;
}

export function planRecipe(
  tree: Tree,
  config: BedrockConfig,
  opts: CreateOptions,
): GeneratorResult {
  const scope = openPlan(config, opts);
  const { raw, names: n, bpRel } = scope;
  const kind = parseRecipeKind(opts.recipeKind ?? "shapeless");
  const result = opts.result?.trim() ? parseNamespacedId(opts.result, "result") : n.identifier;
  const count = parseOutputCount(opts.count, 1);
  const tags = kind === "furnace" ? ["furnace"] : ["crafting_table"];

  if (kind === "shaped") {
    const pattern = parsePattern(opts.pattern);
    const key = parseRecipeKey(opts.recipeKey, pattern);
    tree.write(
      `${bpRel}/recipes/${raw}.json`,
      renderRecipeJson({
        kind,
        identifier: `${n.namespace}:${raw}`,
        tags,
        result,
        count,
        ingredients: [],
        input: "",
        pattern,
        key,
      }),
    );
    return { notes: [`Shaped recipe, pattern ${pattern.join(" / ")}.`] };
  }

  const ingredients = kind === "furnace" ? [] : parseIngredientIds(opts.ingredients);
  const input =
    kind === "furnace"
      ? parseNamespacedId(opts.ingredients?.split(",")[0] ?? "minecraft:cobblestone", "ingredients")
      : "";

  if (kind === "furnace" && opts.ingredients !== undefined) {
    const first = opts.ingredients.split(",")[0]?.trim() ?? "";
    if (first !== "" && FURNACE_TAGS.has(first.toLowerCase())) {
      throw new GenerateError(
        `furnace input "${first}" looks like a station tag. Pass an item id instead.`,
      );
    }
  }

  tree.write(
    `${bpRel}/recipes/${raw}.json`,
    renderRecipeJson({
      kind,
      identifier: `${n.namespace}:${raw}`,
      tags,
      result,
      count,
      ingredients,
      input,
      pattern: [],
      key: {},
    }),
  );

  return { notes: [`Recipe unlocks when the player picks up ${ingredients[0] ?? input}.`] };
}
