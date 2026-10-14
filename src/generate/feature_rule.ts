import type { BedrockConfig } from "../config.js";
import { GenerateError } from "./core/errors.js";
import { openPlan } from "./core/setup.js";
import type { Tree } from "./core/tree.js";
import type { CreateOptions, GeneratorResult } from "./core/types.js";
import { renderFeatureRuleJson } from "./templates/feature_rule.js";

function parseFeatureId(raw: string): string {
  const id = raw.trim();
  if (id === "" || !id.includes(":")) {
    throw new GenerateError(`places_feature must be a namespaced id like "minecraft:ore_feature".`);
  }
  return id;
}

function parseRuleInt(raw: number | undefined, fallback: number, field: string): number {
  const value = raw ?? fallback;
  if (!Number.isInteger(value) || value < 0) {
    throw new GenerateError(`${field} must be an integer >= 0, got ${raw}.`);
  }
  return value;
}

export function planFeatureRule(
  tree: Tree,
  config: BedrockConfig,
  opts: CreateOptions,
): GeneratorResult {
  const scope = openPlan(config, opts);
  const { raw, names: n, bpRel } = scope;
  const placesFeature = opts.result?.trim() ? parseFeatureId(opts.result) : `${n.namespace}:${raw}`;
  const iterations = parseRuleInt(opts.count, 1, "iterations");
  const y = parseRuleInt(opts.min, 90, "y");

  tree.write(
    `${bpRel}/feature_rules/${raw}.json`,
    renderFeatureRuleJson({
      identifier: `${n.namespace}:${raw}`,
      placesFeature,
      iterations,
      y,
    }),
  );
  return { notes: [`Places ${placesFeature} at y ${y} on the final pass.`] };
}
