import type { BedrockConfig } from "../config.js";
import { sidecarPlan, iconNote, writeItemFeature } from "./core/kit.js";
import { iconKey, openPlan } from "./core/setup.js";
import type { Tree } from "./core/tree.js";
import type { CreateOptions, GeneratorResult } from "./core/types.js";
import { VERSIONS } from "./core/versions.js";
import { planLoot } from "./loot.js";
import { planRecipe } from "./recipe.js";

export function planItem(tree: Tree, config: BedrockConfig, opts: CreateOptions): GeneratorResult {
  const scope = openPlan(config, opts);
  const { raw, names: n, bpRel, rpRel } = scope;
  const icon = iconKey(opts, raw);

  writeItemFeature(tree, bpRel, rpRel, raw, n, icon, VERSIONS.item, "items", {
    "minecraft:icon": n.atlasKey,
    "minecraft:display_name": { value: n.displayName },
    "minecraft:max_stack_size": 64,
  });

  const notes = [iconNote(icon)];
  const sidecar = sidecarPlan(opts);
  if (sidecar.recipe !== null) {
    const out = planRecipe(tree, config, {
      ...opts,
      name: raw,
      recipeKind: sidecar.recipe,
      result: n.identifier,
    });
    notes.push(...out.notes);
  }
  if (sidecar.loot !== null) {
    const out = planLoot(tree, config, {
      ...opts,
      name: raw,
      lootKind: "chest",
      result: n.identifier,
    });
    notes.push(...out.notes);
  }

  return { notes };
}
