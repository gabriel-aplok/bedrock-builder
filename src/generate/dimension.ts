import type { BedrockConfig } from "../config.js";
import { GenerateError } from "./core/errors.js";
import { openPlan } from "./core/setup.js";
import type { Tree } from "./core/tree.js";
import type { CreateOptions, GeneratorResult } from "./core/types.js";
import { renderDimensionJson } from "./templates/dimension.js";

const MIN_Y = -512;
const MAX_Y = 512;

function parseMinY(raw: number | undefined): number {
  const value = raw ?? -64;
  if (!Number.isInteger(value) || value < MIN_Y || value > MAX_Y) {
    throw new GenerateError(`min Y must be an integer between ${MIN_Y} and ${MAX_Y}, got ${raw}.`);
  }
  return value;
}

function parseHeight(raw: number | undefined, minY: number): number {
  const value = raw ?? 384;
  if (!Number.isInteger(value) || value < 16) {
    throw new GenerateError(`height range must be an integer >= 16, got ${raw}.`);
  }
  if (minY + value > MAX_Y) {
    throw new GenerateError(`min Y ${minY} plus height ${value} goes above ${MAX_Y}.`);
  }
  return value;
}

export function planDimension(
  tree: Tree,
  config: BedrockConfig,
  opts: CreateOptions,
): GeneratorResult {
  const scope = openPlan(config, opts);
  const { raw, names: n, bpRel } = scope;
  const minY = parseMinY(opts.min);
  const heightRange = parseHeight(opts.count, minY);

  tree.write(
    `${bpRel}/dimensions/${raw}.json`,
    renderDimensionJson({ identifier: n.identifier, minY, heightRange }),
  );
  return { notes: [`Enter it with /execute in ${n.identifier} run tp @s 0 64 0.`] };
}
