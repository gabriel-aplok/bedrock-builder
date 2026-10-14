import { renderJson } from "./serialize.js";

export interface VoxelShapeTemplateOptions {
  identifier: string;
  maxY: number;
}

export function renderVoxelShapeJson(opts: VoxelShapeTemplateOptions): string {
  return renderJson({
    format_version: "1.21.110",
    "minecraft:voxel_shape": {
      description: { identifier: opts.identifier },
      shape: {
        boxes: [{ min: [0, 0, 0], max: [16, opts.maxY, 16] }],
      },
    },
  });
}
