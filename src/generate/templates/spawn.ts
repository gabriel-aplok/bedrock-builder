import { renderJson } from "./serialize.js";

export interface SpawnTemplateOptions {
  identifier: string;
  category: string;
  weight: number;
  herdMin: number;
  herdMax: number;
}

export function renderSpawnJson(opts: SpawnTemplateOptions): string {
  return renderJson({
    format_version: "1.17.0",
    "minecraft:spawn_rules": {
      description: {
        identifier: opts.identifier,
        population_control: opts.category,
      },
      conditions: [
        {
          "minecraft:spawns_on_surface": {},
          "minecraft:weight": { default: opts.weight },
          "minecraft:herd": { min_size: opts.herdMin, max_size: opts.herdMax },
          "minecraft:biome_filter": {
            any_of: [{ test: "has_biome_tag", operator: "==", value: "animal" }],
          },
        },
      ],
    },
  });
}
