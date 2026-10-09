import { VERSIONS } from "../core/versions.js";
import { renderJson } from "./serialize.js";

export interface BlockTemplateOptions {
  identifier: string;
  atlasKey: string;
  renderMethod: string;
  light?: number | undefined;
}

export function renderBlockJson(opts: BlockTemplateOptions): string {
  const components: Record<string, unknown> = {
    "minecraft:geometry": "minecraft:geometry.full_block",
    "minecraft:material_instances": {
      "*": { texture: opts.atlasKey, render_method: opts.renderMethod },
    },
    "minecraft:destructible_by_mining": { seconds_to_destroy: 1.5 },
    "minecraft:destructible_by_explosion": { explosion_resistance: 3 },
    "minecraft:friction": 0.6,
  };
  if (typeof opts.light === "number" && opts.light > 0) {
    components["minecraft:light_emission"] = opts.light;
  }
  return renderJson({
    format_version: VERSIONS.block,
    "minecraft:block": {
      description: {
        identifier: opts.identifier,
        menu_category: { category: "construction" },
      },
      components,
    },
  });
}
