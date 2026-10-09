import type { BedrockConfig } from "../config.js";
import { GenerateError } from "./core/errors.js";
import { openPlan } from "./core/setup.js";
import type { Tree } from "./core/tree.js";
import type { CreateOptions, GeneratorResult } from "./core/types.js";
import { renderVoxelShapeJson } from "./templates/voxel_shape.js";

export function planVoxelShape(
  tree: Tree,
  config: BedrockConfig,
  opts: CreateOptions,
): GeneratorResult {
  const scope = openPlan(config, opts);
  const { raw, names: n, bpRel } = scope;
  const maxY = opts.count ?? 16;
  if (!Number.isInteger(maxY) || maxY < 1 || maxY > 16) {
    throw new GenerateError(`max Y must be an integer 1 to 16, got ${opts.count}.`);
  }

  tree.write(
    `${bpRel}/voxel_shapes/${raw}.json`,
    renderVoxelShapeJson({ identifier: n.identifier, maxY }),
  );
  return { notes: [`Reference ${n.identifier} from a block geometry culling field.`] };
}
