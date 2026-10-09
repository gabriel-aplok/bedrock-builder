import type { BedrockConfig } from "../config.js";
import { openPlan } from "./core/setup.js";
import type { Tree } from "./core/tree.js";
import type { CreateOptions, GeneratorResult } from "./core/types.js";
import { renderParticleJson } from "./templates/particle.js";

export function planParticle(
  tree: Tree,
  config: BedrockConfig,
  opts: CreateOptions,
): GeneratorResult {
  const scope = openPlan(config, opts);
  const { raw, names: n, rpRel } = scope;
  const texture = opts.texture?.trim() || "textures/particle/particles";

  tree.write(
    `${rpRel}/particles/${raw}.json`,
    renderParticleJson({ identifier: n.identifier, texture }),
  );
  return { notes: [`Spawn it with /particle ${n.identifier}.`] };
}
