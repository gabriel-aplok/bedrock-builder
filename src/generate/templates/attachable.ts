import { VERSIONS } from "../core/versions.js";
import { renderJson } from "./serialize.js";

export interface WeaponAttachableOptions {
  identifier: string;
  geometry: string;
  texture: string;
  renderController: string;
  animationPrefix: string;
}

export function renderWeaponAttachableJson(opts: WeaponAttachableOptions): string {
  return renderJson({
    format_version: VERSIONS.attachable,
    "minecraft:attachable": {
      description: {
        identifier: opts.identifier,
        materials: {
          default: "entity_alphatest",
          enchanted: "entity_alphatest_glint",
        },
        textures: {
          default: opts.texture,
          enchanted: "textures/misc/enchanted_item_glint",
        },
        geometry: { default: opts.geometry },
        animations: {
          first_person: `${opts.animationPrefix}.first_person`,
          third_person: `${opts.animationPrefix}.third_person`,
        },
        scripts: {
          animate: [{ first_person: "c.is_first_person" }, { third_person: "!c.is_first_person" }],
        },
        render_controllers: [opts.renderController],
      },
    },
  });
}

export interface ArmorAttachableOptions {
  identifier: string;
  geometry: string;
  texture: string;
  renderController: string;
}

export function renderArmorAttachableJson(opts: ArmorAttachableOptions): string {
  return renderJson({
    format_version: VERSIONS.attachable,
    "minecraft:attachable": {
      description: {
        identifier: opts.identifier,
        materials: { default: "armor", enchanted: "armor_enchanted" },
        textures: {
          default: opts.texture,
          enchanted: "textures/misc/enchanted_item_glint",
        },
        geometry: { default: opts.geometry },
        render_controllers: [opts.renderController],
      },
    },
  });
}
