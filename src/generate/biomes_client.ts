import type { BedrockConfig } from "../config.js";
import { openPlan } from "./core/setup.js";
import { mergeBiomeClient } from "./core/registries.js";
import type { Tree } from "./core/tree.js";
import type { CreateOptions, GeneratorResult } from "./core/types.js";

export function planBiomesClient(
  tree: Tree,
  config: BedrockConfig,
  opts: CreateOptions,
): GeneratorResult {
  const scope = openPlan(config, opts);
  const { raw, names: n, rpRel } = scope;
  const waterColor = opts.color?.trim() || "#44AFF5";
  const fogId = opts.fog?.trim() || `minecraft:fog_${raw}`;

  mergeBiomeClient(tree, rpRel, n.identifier, waterColor, fogId);
  return { notes: [`Adds ${n.identifier} to biomes_client.json.`] };
}
