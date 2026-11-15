import type { BedrockConfig } from "../config.js";
import { openPlan } from "./core/setup.js";
import type { Tree } from "./core/tree.js";
import type { CreateOptions, GeneratorResult } from "./core/types.js";
import { renderAnimationJson } from "./templates/animation.js";

export function planAnimation(
  tree: Tree,
  config: BedrockConfig,
  opts: CreateOptions,
): GeneratorResult {
  const scope = openPlan(config, opts);
  const { raw, names: n, rpRel } = scope;
  const controller = `controller.animation.${n.namespace}.${raw}`;
  const animation = opts.animation?.trim() || `${raw}.idle`;

  tree.write(
    `${rpRel}/animation_controllers/${raw}.json`,
    renderAnimationJson({ controller, animation }),
  );
  return { notes: [`Add the "${animation}" animation file, then reference ${controller}.`] };
}
