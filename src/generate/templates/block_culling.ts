import { renderJson } from "./serialize.js";

export interface BlockCullingTemplateOptions {
  identifier: string;
  direction: string;
}

export function renderBlockCullingJson(opts: BlockCullingTemplateOptions): string {
  return renderJson({
    format_version: "1.21.60",
    "minecraft:block_culling_rules": {
      description: { identifier: opts.identifier },
      rules: [
        {
          direction: opts.direction,
          geometry_part: { bone: "body", cube: 0 },
        },
      ],
    },
  });
}
