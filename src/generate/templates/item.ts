import { renderJson } from "./serialize.js";

export interface ItemTemplateOptions {
  formatVersion: string;
  identifier: string;
  category: string;
  components: Record<string, unknown>;
}

export function renderItemJson(opts: ItemTemplateOptions): string {
  return renderJson({
    format_version: opts.formatVersion,
    "minecraft:item": {
      description: {
        identifier: opts.identifier,
        menu_category: { category: opts.category },
      },
      components: opts.components,
    },
  });
}

export function iconComponent(atlasKey: string): string {
  return atlasKey;
}
