import type { BedrockConfig } from "../config.js";
import { GenerateError } from "./core/errors.js";
import { openPlan } from "./core/setup.js";
import type { Tree } from "./core/tree.js";
import type { CreateOptions, GeneratorResult } from "./core/types.js";
import { renderSpawnJson } from "./templates/spawn.js";

const CATEGORIES = new Set(["animal", "monster", "ambient", "water"]);

function parseCategory(raw: string): string {
  const category = raw.toLowerCase();
  if (CATEGORIES.has(category)) return category;
  throw new GenerateError(
    `Unknown spawn category "${raw}". Pick animal, monster, ambient, or water.`,
  );
}

function parseSpawnInt(raw: number | undefined, fallback: number, field: string): number {
  const value = raw ?? fallback;
  if (!Number.isInteger(value) || value < 1) {
    throw new GenerateError(`${field} must be an integer >= 1, got ${raw}.`);
  }
  return value;
}

export function planSpawn(tree: Tree, config: BedrockConfig, opts: CreateOptions): GeneratorResult {
  const scope = openPlan(config, opts);
  const { raw, names: n, bpRel } = scope;
  const category = parseCategory(opts.spawnCategory ?? "animal");
  const weight = parseSpawnInt(opts.weight, 10, "weight");
  const herdMin = parseSpawnInt(opts.min, 1, "min");
  const herdMax = parseSpawnInt(opts.max, 2, "max");
  if (herdMin > herdMax) throw new GenerateError(`min ${herdMin} is above max ${herdMax}.`);

  tree.write(
    `${bpRel}/spawn_rules/${raw}.json`,
    renderSpawnJson({
      identifier: n.identifier,
      category,
      weight,
      herdMin,
      herdMax,
    }),
  );
  return { notes: [`Spawns ${n.identifier} on the surface in animal biomes.`] };
}
