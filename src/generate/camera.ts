import type { BedrockConfig } from "../config.js";
import { openPlan } from "./core/setup.js";
import type { Tree } from "./core/tree.js";
import type { CreateOptions, GeneratorResult } from "./core/types.js";
import { renderCameraJson } from "./templates/camera.js";

export function planCamera(
  tree: Tree,
  config: BedrockConfig,
  opts: CreateOptions,
): GeneratorResult {
  const scope = openPlan(config, opts);
  const { raw, names: n, bpRel } = scope;
  const x = opts.x ?? 0;
  const y = opts.y ?? 0;
  const z = opts.z ?? 0;

  tree.write(
    `${bpRel}/cameras/presets/${raw}.json`,
    renderCameraJson({ identifier: n.identifier, x, y, z }),
  );
  return { notes: [`Apply it with /camera @s set ${n.identifier}.`] };
}
