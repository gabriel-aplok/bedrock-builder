import { renderJson } from "./serialize.js";

export interface CameraTemplateOptions {
  identifier: string;
  x: number;
  y: number;
  z: number;
}

export function renderCameraJson(opts: CameraTemplateOptions): string {
  return renderJson({
    format_version: "1.19.50",
    "minecraft:camera_preset": {
      identifier: opts.identifier,
      inherit_from: "minecraft:free",
      pos_x: opts.x,
      pos_y: opts.y,
      pos_z: opts.z,
    },
  });
}
