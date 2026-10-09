import { renderJson } from "./serialize.js";

export interface FogTemplateOptions {
  identifier: string;
  color: string;
  start: number;
  end: number;
}

export function renderFogJson(opts: FogTemplateOptions): string {
  return renderJson({
    format_version: "1.21.90",
    "minecraft:fog_settings": {
      description: { identifier: opts.identifier },
      distance: {
        air: {
          fog_start: opts.start,
          fog_end: opts.end,
          fog_color: opts.color,
          render_distance_type: "fixed",
        },
      },
    },
  });
}
