import type { BedrockConfig } from "../config.js";
import { GenerateError } from "./core/errors.js";
import { openPlan } from "./core/setup.js";
import type { Tree } from "./core/tree.js";
import type { CreateOptions, GeneratorResult } from "./core/types.js";
import { renderFogJson } from "./templates/fog.js";

function parseFogNumber(raw: number | undefined, fallback: number, field: string): number {
  const value = raw ?? fallback;
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new GenerateError(`${field} must be a number, got ${raw}.`);
  }
  return value;
}

export function planFog(tree: Tree, config: BedrockConfig, opts: CreateOptions): GeneratorResult {
  const scope = openPlan(config, opts);
  const { raw, names: n, rpRel } = scope;
  const color = opts.color?.trim() || "#14A2C5";
  const start = parseFogNumber(opts.min, 0, "fog_start");
  const end = parseFogNumber(opts.max, 60, "fog_end");

  tree.write(
    `${rpRel}/fogs/${raw}.json`,
    renderFogJson({ identifier: n.identifier, color, start, end }),
  );
  return { notes: [`Reference ${n.identifier} from a client biome fog_appearance.`] };
}
