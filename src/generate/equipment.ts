import type { BedrockConfig } from "../config.js";
import { GenerateError } from "./core/errors.js";
import { openPlan } from "./core/setup.js";
import type { Tree } from "./core/tree.js";
import type { CreateOptions, GeneratorResult } from "./core/types.js";
import { renderEquipmentJson } from "./templates/equipment.js";

function parseDropId(raw: string): string {
  const id = raw.trim();
  if (id === "" || !id.includes(":")) {
    throw new GenerateError(`drop must be a namespaced id like "minecraft:iron_sword".`);
  }
  return id;
}

function parseChance(raw: number | undefined): number {
  const chance = raw ?? 100;
  if (chance < 0 || chance > 100) {
    throw new GenerateError(`chance must be 0 to 100, got ${raw}.`);
  }
  return chance / 100;
}

export function planEquipment(
  tree: Tree,
  config: BedrockConfig,
  opts: CreateOptions,
): GeneratorResult {
  const scope = openPlan(config, opts);
  const { raw, names: n, bpRel } = scope;
  const drop = opts.result?.trim() ? parseDropId(opts.result) : `${n.namespace}:${raw}`;
  const chance = parseChance(opts.rolls);

  tree.write(
    `${bpRel}/loot_tables/entities/${raw}_equipment.json`,
    renderEquipmentJson({ drop, chance }),
  );

  const table = `loot_tables/entities/${raw}_equipment.json`;
  return {
    notes: [`Wire it with "minecraft:equipment": { "table": "${table}" } in the entity.`],
  };
}
