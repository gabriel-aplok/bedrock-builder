import { renderJson } from "./serialize.js";

export interface BiomeTemplateOptions {
  identifier: string;
  waterColor: string;
  fogId: string;
}

export function renderBiomeJson(opts: BiomeTemplateOptions): string {
  return renderJson({
    format_version: "1.21.120",
    "minecraft:client_biome": {
      description: { identifier: opts.identifier },
      components: {
        "minecraft:fog_appearance": { fog_identifier: opts.fogId },
        "minecraft:water_appearance": { surface_color: opts.waterColor },
      },
    },
  });
}
