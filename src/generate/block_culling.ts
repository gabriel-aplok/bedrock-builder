import type { BedrockConfig } from "../config.js";
import { GenerateError } from "./core/errors.js";
import { openPlan } from "./core/setup.js";
import type { Tree } from "./core/tree.js";
import type { CreateOptions, GeneratorResult } from "./core/types.js";
import { renderBlockCullingJson } from "./templates/block_culling.js";

const DIRECTIONS = new Set(["up", "down", "north", "south", "east", "west"]);

function parseDirection(raw: string): string {
  const direction = raw.toLowerCase();
  if (DIRECTIONS.has(direction)) return direction;
  throw new GenerateError(
    `Unknown culling direction "${raw}". Pick up, down, north, south, east, or west.`,
  );
}

export function planBlockCulling(
  tree: Tree,
  config: BedrockConfig,
  opts: CreateOptions,
): GeneratorResult {
  const scope = openPlan(config, opts);
  const { raw, names: n, rpRel } = scope;
  const direction = parseDirection(opts.direction ?? "up");

  tree.write(
    `${rpRel}/block_culling/${raw}.json`,
    renderBlockCullingJson({ identifier: n.identifier, direction }),
  );
  return { notes: [`Reference ${n.identifier} from a block geometry culling field.`] };
}
