import { VERSIONS } from "../core/versions.js";
import { renderJson } from "./serialize.js";

export interface RecipeTemplateOptions {
  kind: "shapeless" | "shaped" | "furnace";
  identifier: string;
  tags: string[];
  result: string;
  count: number;
  ingredients: string[];
  input: string;
  pattern: string[];
  key: Record<string, string>;
}

export function renderRecipeJson(opts: RecipeTemplateOptions): string {
  if (opts.kind === "furnace") {
    return renderJson({
      format_version: VERSIONS.recipe,
      "minecraft:recipe_furnace": {
        description: { identifier: opts.identifier },
        tags: opts.tags,
        input: opts.input,
        output: { item: opts.result, count: opts.count },
      },
    });
  }
  if (opts.kind === "shaped") {
    const key: Record<string, { item: string }> = {};
    for (const [symbol, item] of Object.entries(opts.key)) {
      key[symbol] = { item };
    }
    return renderJson({
      format_version: VERSIONS.recipe,
      "minecraft:recipe_shaped": {
        description: { identifier: opts.identifier },
        tags: opts.tags,
        pattern: opts.pattern,
        key,
        result: { item: opts.result, count: opts.count },
      },
    });
  }
  return renderJson({
    format_version: VERSIONS.recipe,
    "minecraft:recipe_shapeless": {
      description: { identifier: opts.identifier },
      tags: opts.tags,
      ingredients: opts.ingredients.map((item) => ({ item })),
      result: { item: opts.result, count: opts.count },
    },
  });
}
