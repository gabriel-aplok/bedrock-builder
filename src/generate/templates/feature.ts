import { renderJson } from "./serialize.js";

export interface FeatureTemplateOptions {
  identifier: string;
  placesBlock: string;
  count: number;
}

export function renderFeatureJson(opts: FeatureTemplateOptions): string {
  return renderJson({
    format_version: "1.13.0",
    "minecraft:ore_feature": {
      description: { identifier: opts.identifier },
      count: opts.count,
      replace_rules: [
        {
          places_block: opts.placesBlock,
          may_replace: ["minecraft:stone", "minecraft:deepslate"],
        },
      ],
    },
  });
}
