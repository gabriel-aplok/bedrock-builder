import type { BedrockConfig } from "../config.js";
import { openPlan } from "./core/setup.js";
import type { Tree } from "./core/tree.js";
import type { CreateOptions, GeneratorResult } from "./core/types.js";
import { renderBiomeJson } from "./templates/biome.js";

export function planBiome(tree: Tree, config: BedrockConfig, opts: CreateOptions): GeneratorResult {
  const scope = openPlan(config, opts);
  const { raw, names: n, rpRel } = scope;
  const waterColor = opts.color?.trim() || "#14A2C5";
  const fogId = opts.fog?.trim() || `minecraft:fog_${raw}`;

  tree.write(
    `${rpRel}/biomes/${raw}.json`,
    renderBiomeJson({
      identifier: n.identifier,
      waterColor,
      fogId,
    }),
  );
  return { notes: [`Reference ${n.identifier} from a world-gen biome definition.`] };
}
