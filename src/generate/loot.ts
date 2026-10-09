import type { BedrockConfig } from "../config.js";
import { GenerateError } from "./core/errors.js";
import { openPlan } from "./core/setup.js";
import type { Tree } from "./core/tree.js";
import type { CreateOptions, GeneratorResult } from "./core/types.js";
import { renderLootJson } from "./templates/loot.js";

export function lootFolder(kind: "entity" | "block" | "chest"): string {
  return kind === "block" ? "blocks" : kind === "chest" ? "chests" : "entities";
}

function parseLootKind(raw: string): "entity" | "block" | "chest" {
  const kind = raw.toLowerCase();
  if (kind === "entity" || kind === "block" || kind === "chest") return kind;
  throw new GenerateError(`Unknown loot kind "${raw}". Pick entity, block, or chest.`);
}

function parseDropId(raw: string, field: string): string {
  const id = raw.trim();
  if (id === "" || !id.includes(":")) {
    throw new GenerateError(`${field} must be a namespaced id like "minecraft:coal".`);
  }
  return id;
}

function parseDropRange(raw: number | undefined, fallback: number, field: string): number {
  const value = raw ?? fallback;
  if (!Number.isInteger(value) || value < 0) {
    throw new GenerateError(`${field} must be an integer >= 0, got ${raw}.`);
  }
  return value;
}

export function planLoot(tree: Tree, config: BedrockConfig, opts: CreateOptions): GeneratorResult {
  const scope = openPlan(config, opts);
  const { raw, names: n, bpRel } = scope;
  const kind = parseLootKind(opts.lootKind ?? "entity");
  const folder = lootFolder(kind);
  const drop = opts.result?.trim() ? parseDropId(opts.result, "result") : n.identifier;
  const rolls = parseDropRange(opts.rolls, 1, "rolls");
  if (rolls < 1) throw new GenerateError(`rolls must be >= 1, got ${opts.rolls}.`);
  const min = parseDropRange(opts.min, kind === "entity" ? 0 : 1, "min");
  const max = parseDropRange(opts.max, 1, "max");
  if (min > max) throw new GenerateError(`min ${min} is above max ${max}.`);

  tree.write(
    `${bpRel}/loot_tables/${folder}/${raw}.json`,
    renderLootJson({ rolls, drop, min, max }),
  );

  const rel = `loot_tables/${folder}/${raw}.json`;
  const note =
    kind === "entity"
      ? `Wire it with "minecraft:loot": { "table": "${rel}" } in the entity file.`
      : kind === "block"
        ? `Wire it with "minecraft:loot": "${rel}" in the block file.`
        : `Use it with /loot or a fill_container function at "${rel}".`;
  return { notes: [note] };
}
