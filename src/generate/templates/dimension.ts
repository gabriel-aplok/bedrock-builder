import { renderJson } from "./serialize.js";

export interface DimensionTemplateOptions {
  identifier: string;
  minY: number;
  heightRange: number;
}

export function renderDimensionJson(opts: DimensionTemplateOptions): string {
  return renderJson({
    format_version: "1.21.60",
    "minecraft:dimension": {
      description: { identifier: opts.identifier },
      components: {
        "minecraft:generation": { generator_type: "void" },
        "minecraft:dimension_height": {
          min_y: opts.minY,
          height_range: opts.heightRange,
        },
      },
    },
  });
}
