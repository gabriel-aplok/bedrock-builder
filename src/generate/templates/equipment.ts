import { renderJson } from "./serialize.js";

export interface EquipmentTemplateOptions {
  drop: string;
  chance: number;
}

export function renderEquipmentJson(opts: EquipmentTemplateOptions): string {
  return renderJson({
    pools: [
      {
        rolls: 1,
        conditions: [{ condition: "random_chance", chance: opts.chance }],
        entries: [{ type: "item", name: opts.drop, weight: 1 }],
      },
    ],
  });
}
