import { renderJson } from "./serialize.js";

export interface FeatureRuleTemplateOptions {
  identifier: string;
  placesFeature: string;
  iterations: number;
  y: number;
}

export function renderFeatureRuleJson(opts: FeatureRuleTemplateOptions): string {
  return renderJson({
    format_version: "1.13.0",
    "minecraft:feature_rules": {
      description: {
        identifier: opts.identifier,
        places_feature: opts.placesFeature,
      },
      conditions: { placement_pass: "final_pass" },
      distribution: { iterations: opts.iterations, x: 0, z: 0, y: opts.y },
    },
  });
}
