import type { BedrockConfig } from "../config.js";
import { GenerateError } from "./core/errors.js";
import { openPlan } from "./core/setup.js";
import type { Tree } from "./core/tree.js";
import type { CreateOptions, GeneratorResult } from "./core/types.js";
import { renderFeatureJson } from "./templates/feature.js";

function parseBlockId(raw: string): string {
  const id = raw.trim();
  if (id === "" || !id.includes(":")) {
    throw new GenerateError(`block must be a namespaced id like "minecraft:diamond_ore".`);
  }
  return id;
}

function parseFeatureCount(raw: number | undefined): number {
  const count = raw ?? 10;
  if (!Number.isInteger(count) || count < 1) {
    throw new GenerateError(`count must be an integer >= 1, got ${raw}.`);
  }
  return count;
}

export function planFeature(
  tree: Tree,
  config: BedrockConfig,
  opts: CreateOptions,
): GeneratorResult {
  const scope = openPlan(config, opts);
  const { raw, names: n, bpRel } = scope;
  const placesBlock = opts.result?.trim() ? parseBlockId(opts.result) : "minecraft:diamond_ore";
  const count = parseFeatureCount(opts.count);

  tree.write(
    `${bpRel}/features/${raw}.json`,
    renderFeatureJson({
      identifier: `${n.namespace}:${raw}`,
      placesBlock,
      count,
    }),
  );
  return {
    notes: [`Place it with a feature_rule pointing at ${n.namespace}:${raw}.`],
  };
}
