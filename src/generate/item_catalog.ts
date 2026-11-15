import type { BedrockConfig } from "../config.js";
import { GenerateError } from "./core/errors.js";
import { openPlan } from "./core/setup.js";
import type { Tree } from "./core/tree.js";
import type { CreateOptions, GeneratorResult } from "./core/types.js";
import { renderItemCatalogJson } from "./templates/item_catalog.js";

const CATEGORIES = new Set(["construction", "equipment", "items", "nature"]);

function parseCategory(raw: string): string {
  const category = raw.toLowerCase();
  if (CATEGORIES.has(category)) return category;
  throw new GenerateError(
    `Unknown catalog category "${raw}". Pick construction, equipment, items, or nature.`,
  );
}

export function planItemCatalog(
  tree: Tree,
  config: BedrockConfig,
  opts: CreateOptions,
): GeneratorResult {
  const scope = openPlan(config, opts);
  const { raw, names: n, bpRel } = scope;
  const category = parseCategory(opts.category ?? "items");
  const group = opts.group?.trim() || `${n.namespace}:${raw}`;
  const item = opts.result?.trim() || n.identifier;

  tree.write(`${bpRel}/item_catalog/${raw}.json`, renderItemCatalogJson({ category, group, item }));
  return { notes: [`Adds ${item} to the ${category} catalog group.`] };
}
