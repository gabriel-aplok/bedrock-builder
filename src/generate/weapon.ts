import type { BedrockConfig } from "../config.js";
import {
  iconNote,
  isMode,
  modelRefs,
  writeItemFeature,
  writeWeaponAttachable,
} from "./core/kit.js";
import { iconKey, openPlan } from "./core/setup.js";
import type { Tree } from "./core/tree.js";
import type { CreateOptions, GeneratorResult } from "./core/types.js";
import { VERSIONS } from "./core/versions.js";

const BASE_DURABILITY = 1561;
const BASE_DAMAGE = 7;
const BASE_ENCHANT = 10;

export function planWeapon(
  tree: Tree,
  config: BedrockConfig,
  opts: CreateOptions,
): GeneratorResult {
  const scope = openPlan(config, opts);
  const { raw, names: n, bpRel, rpRel } = scope;
  const icon = iconKey(opts, raw);

  writeItemFeature(tree, bpRel, rpRel, raw, n, icon, VERSIONS.item, "equipment", {
    "minecraft:icon": n.atlasKey,
    "minecraft:display_name": { value: n.displayName },
    "minecraft:max_stack_size": 1,
    "minecraft:hand_equipped": true,
    "minecraft:damage": opts.damage ?? BASE_DAMAGE,
    "minecraft:durability": {
      max_durability: opts.durability ?? BASE_DURABILITY,
    },
    "minecraft:enchantable": {
      slot: "sword",
      value: opts.enchantValue ?? BASE_ENCHANT,
    },
  });

  const notes = [iconNote(icon)];
  if (!isMode(opts.mode, "3d", "2d")) return { notes };

  const { geometry, texture } = modelRefs(
    opts,
    n.namespace,
    raw,
    `textures/${n.namespace}/items/${raw}`,
  );
  const controller = `controller.render.${n.atlasKey}`;
  const anims = `animation.${n.namespace}.${raw}`;
  writeWeaponAttachable(tree, rpRel, raw, n.identifier, geometry, texture, controller, anims);

  notes.push(
    `3D weapon: put the model in RP/models/entity/, animations in RP/animations/ (wired as "${anims}.first_person" and ".third_person", rename to match yours), texture at ${texture}.png.`,
    "Only references are wired. If it misrenders, fix the art, not the JSON.",
  );
  return { notes };
}
