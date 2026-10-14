import { renderJson } from "./serialize.js";

export interface LootTemplateOptions {
  rolls: number;
  drop: string;
  min: number;
  max: number;
}

export function renderLootTableJson(pools: number): string {
  return renderJson({
    pools: Array.from({ length: pools }, () => ({
      rolls: 1,
      entries: [{ type: "empty", weight: 1 }],
    })),
  });
}

export function renderLootJson(opts: LootTemplateOptions): string {
  return renderJson({
    pools: [
      {
        rolls: opts.rolls,
        entries: [
          {
            type: "item",
            name: opts.drop,
            weight: 1,
            functions: [
              {
                function: "set_count",
                count: { min: opts.min, max: opts.max },
              },
              {
                function: "looting_enchant",
                count: { min: 0, max: 1 },
              },
            ],
          },
        ],
      },
    ],
  });
}
