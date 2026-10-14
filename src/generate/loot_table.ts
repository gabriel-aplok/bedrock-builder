import type { BedrockConfig } from "../config.js";
import { GenerateError } from "./core/errors.js";
import { openPlan } from "./core/setup.js";
import type { Tree } from "./core/tree.js";
import type { CreateOptions, GeneratorResult } from "./core/types.js";
import { renderLootTableJson } from "./templates/loot.js";
import { lootFolder } from "./loot.js";

function parsePools(raw: number | undefined): number {
  const pools = raw ?? 3;
  if (!Number.isInteger(pools) || pools < 1 || pools > 16) {
    throw new GenerateError(`pools must be an integer from 1 to 16, got ${raw}.`);
  }
  return pools;
}

function parseFolder(raw: string | undefined): "entity" | "block" | "chest" {
  const kind = (raw ?? "chest").toLowerCase();
  if (kind === "entity" || kind === "block" || kind === "chest") return kind;
  throw new GenerateError(`Unknown loot kind "${raw}". Pick entity, block, or chest.`);
}

export function planLootTable(
  tree: Tree,
  config: BedrockConfig,
  opts: CreateOptions,
): GeneratorResult {
  const scope = openPlan(config, opts);
  const { raw, bpRel } = scope;
  const folder = lootFolder(parseFolder(opts.lootKind));
  const pools = parsePools(opts.pools);

  tree.write(`${bpRel}/loot_tables/${folder}/${raw}.json`, renderLootTableJson(pools));

  return {
    notes: [
      `${pools} empty ${pools === 1 ? "pool" : "pools"} at loot_tables/${folder}/${raw}.json. Replace the empty entries with item entries.`,
    ],
  };
}
