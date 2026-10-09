import type { BedrockConfig } from "../config.js";
import { sidecarPlan, parseRenderMethod, writeLangTail } from "./core/kit.js";
import { stripPng } from "./core/names.js";
import { mergeBlocks, mergeTerrainTexture } from "./core/registries.js";
import { openPlan } from "./core/setup.js";
import type { Tree } from "./core/tree.js";
import type { CreateOptions, GeneratorResult } from "./core/types.js";
import { renderBlockJson } from "./templates/block.js";
import { planLoot } from "./loot.js";
import { planRecipe } from "./recipe.js";

export function planBlock(tree: Tree, config: BedrockConfig, opts: CreateOptions): GeneratorResult {
  const scope = openPlan(config, opts);
  const { raw, names: n, bpRel, rpRel } = scope;
  const texture = stripPng((opts.texture ?? raw).trim());
  const sound = (opts.sound ?? "stone").trim();

  tree.write(
    `${bpRel}/blocks/${raw}.block.json`,
    // geometry and material instances must pair on 1.21.80+.
    renderBlockJson({
      identifier: n.identifier,
      atlasKey: n.atlasKey,
      renderMethod: parseRenderMethod(opts.renderMethod ?? "opaque"),
      light: opts.light,
    }),
  );

  mergeTerrainTexture(tree, rpRel, n.atlasKey, `textures/blocks/${texture}`);
  mergeBlocks(tree, rpRel, n.identifier, n.atlasKey, sound);
  writeLangTail(tree, rpRel, [[`tile.${n.identifier}.name`, n.displayName]]);

  const notes = [`Drop the block PNG at RP/textures/blocks/${texture}.png`];
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
      lootKind: "block",
      result: n.identifier,
    });
    notes.push(...out.notes);
  }

  return { notes };
}
