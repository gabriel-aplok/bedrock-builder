import { renderJson } from "./serialize.js";

export interface ItemCatalogTemplateOptions {
  category: string;
  group: string;
  item: string;
}

export function renderItemCatalogJson(opts: ItemCatalogTemplateOptions): string {
  return renderJson({
    format_version: "1.21.60",
    "minecraft:crafting_items_catalog": {
      categories: [
        {
          category_name: opts.category,
          groups: [
            {
              group_identifier: { name: opts.group, icon: opts.item },
              items: [{ name: opts.item }],
            },
          ],
        },
      ],
    },
  });
}
