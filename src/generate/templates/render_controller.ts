import { VERSIONS } from "../core/versions.js";
import { renderJson } from "./serialize.js";

export interface RenderControllerOptions {
  id: string;
}

export function renderRenderControllerJson(opts: RenderControllerOptions): string {
  return renderJson({
    format_version: VERSIONS.renderController,
    render_controllers: {
      [opts.id]: {
        geometry: "Geometry.default",
        materials: [{ "*": "Material.default" }],
        textures: ["Texture.default"],
      },
    },
  });
}
