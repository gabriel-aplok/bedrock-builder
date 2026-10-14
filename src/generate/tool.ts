import type { BedrockConfig } from "../config.js";
import { GenerateError } from "./core/errors.js";
import { iconNote, writeItemFeature } from "./core/kit.js";
import { iconKey, openPlan } from "./core/setup.js";
import type { Tree } from "./core/tree.js";
import type { CreateOptions, GeneratorResult } from "./core/types.js";
import { VERSIONS } from "./core/versions.js";

export type ToolVariant = "pickaxe" | "axe" | "shovel" | "hoe";

interface VariantSpec {
  tag: string;
  slot: string;
  query: string;
  damage: number;
}

const VARIANTS: Record<ToolVariant, VariantSpec> = {
  pickaxe: {
    tag: "minecraft:is_pickaxe",
    slot: "pickaxe",
    query: "minecraft:is_pickaxe_item_destructible",
    damage: 6,
  },
  axe: {
    tag: "minecraft:is_axe",
    slot: "axe",
    query: "minecraft:is_axe_item_destructible",
    damage: 7,
  },
  shovel: {
    tag: "minecraft:is_shovel",
    slot: "shovel",
    query: "minecraft:is_shovel_item_destructible",
    damage: 5,
  },
  hoe: {
    tag: "minecraft:is_hoe",
    slot: "hoe",
    query: "minecraft:is_hoe_item_destructible",
    damage: 4,
  },
};

const DIAMOND_LIFE = 1562;
const DIAMOND_ENCHANT = 10;

function asVariant(raw: string): ToolVariant {
  if (raw === "pickaxe" || raw === "axe" || raw === "shovel" || raw === "hoe") return raw;
  throw new GenerateError(`Unknown tool variant "${raw}". Pick pickaxe, axe, shovel, or hoe.`);
}

export function planTool(tree: Tree, config: BedrockConfig, opts: CreateOptions): GeneratorResult {
  const scope = openPlan(config, opts);
  const { raw, names: n, bpRel, rpRel } = scope;
  const spec = VARIANTS[asVariant((opts.variant ?? "pickaxe").toLowerCase())];
  const icon = iconKey(opts, raw);
  const tier = (opts.tier ?? "diamond").trim();
  const repair = (opts.repairItem ?? "minecraft:diamond").trim();

  writeItemFeature(tree, bpRel, rpRel, raw, n, icon, VERSIONS.item, "equipment", {
    "minecraft:icon": n.atlasKey,
    "minecraft:display_name": { value: n.displayName },
    "minecraft:max_stack_size": 1,
    "minecraft:hand_equipped": true,
    "minecraft:durability": {
      max_durability: opts.durability ?? DIAMOND_LIFE,
    },
    "minecraft:damage": opts.damage ?? spec.damage,
    "minecraft:enchantable": {
      slot: spec.slot,
      value: opts.enchantValue ?? DIAMOND_ENCHANT,
    },
    "minecraft:repairable": {
      repair_items: [
        {
          items: [repair],
          repair_amount:
            "context.other->q.remaining_durability + 0.05 * context.other->q.max_durability",
        },
      ],
    },
    "minecraft:digger": {
      use_efficiency: true,
      destroy_speeds: [{ block: { tags: `query.any_tag('${spec.query}')` }, speed: 8 }],
    },
    "minecraft:tags": { tags: [spec.tag, `minecraft:${tier}_tier`] },
  });

  return { notes: [iconNote(icon)] };
}
