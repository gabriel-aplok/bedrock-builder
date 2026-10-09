import type { BedrockConfig } from "../config.js";
import { GenerateError } from "./core/errors.js";
import { iconNote, isMode, modelRefs, writeArmorAttachable, writeItemFeature } from "./core/kit.js";
import { iconKey, openPlan } from "./core/setup.js";
import type { Tree } from "./core/tree.js";
import type { CreateOptions, GeneratorResult } from "./core/types.js";
import { VERSIONS } from "./core/versions.js";

export type ArmorPiece = "helmet" | "chestplate" | "leggings" | "boots";

interface PieceSpec {
  slot: string;
  enchant: string;
  life: number;
  guard: number;
}

const PIECES: Record<ArmorPiece, PieceSpec> = {
  helmet: {
    slot: "slot.armor.head",
    enchant: "armor_head",
    life: 265,
    guard: 2,
  },
  chestplate: {
    slot: "slot.armor.chest",
    enchant: "armor_torso",
    life: 340,
    guard: 6,
  },
  leggings: {
    slot: "slot.armor.legs",
    enchant: "armor_legs",
    life: 325,
    guard: 5,
  },
  boots: {
    slot: "slot.armor.feet",
    enchant: "armor_feet",
    life: 295,
    guard: 2,
  },
};

const ENCHANT_VALUE = 9;

function asPiece(raw: string): ArmorPiece {
  if (raw === "helmet" || raw === "chestplate" || raw === "leggings" || raw === "boots") return raw;
  throw new GenerateError(
    `Unknown armor piece "${raw}". Pick helmet, chestplate, leggings, or boots.`,
  );
}

export function planArmor(tree: Tree, config: BedrockConfig, opts: CreateOptions): GeneratorResult {
  const scope = openPlan(config, opts);
  const { raw, names: n, bpRel, rpRel } = scope;
  const spec = PIECES[asPiece((opts.piece ?? "chestplate").toLowerCase())];
  const icon = iconKey(opts, raw);
  const repair = (opts.repairItem ?? "minecraft:diamond").trim();

  writeItemFeature(tree, bpRel, rpRel, raw, n, icon, VERSIONS.armorItem, "equipment", {
    "minecraft:max_stack_size": 1,
    "minecraft:icon": n.atlasKey,
    "minecraft:display_name": { value: n.displayName },
    "minecraft:enchantable": { value: ENCHANT_VALUE, slot: spec.enchant },
    "minecraft:durability": {
      max_durability: opts.durability ?? spec.life,
      damage_chance: { min: 60, max: 100 },
    },
    "minecraft:wearable": {
      slot: spec.slot,
      protection: opts.protection ?? spec.guard,
    },
    "minecraft:repairable": {
      repair_items: [{ items: [repair], repair_amount: "query.max_durability * 0.25" }],
    },
  });

  const notes = [iconNote(icon)];
  if (!isMode(opts.mode, "3d", "icon")) {
    notes.push(
      "Icon mode only buffs, nothing shows on the body. Re-run with --mode 3d for the attachable.",
    );
    return { notes };
  }

  const { geometry, texture } = modelRefs(
    opts,
    n.namespace,
    raw,
    `textures/${n.namespace}/models/${raw}`,
  );
  const controller = `controller.render.${n.atlasKey}`;
  writeArmorAttachable(tree, rpRel, raw, n.identifier, geometry, texture, controller);

  notes.push(
    `3D armor: import the model plus texture at ${texture}.png. References only, tune the art yourself.`,
  );
  return { notes };
}
