import type { BedrockConfig } from "../config.js";
import { sidecarPlan, isMode, modelRefs, writeLangTail } from "./core/kit.js";
import { stripPng } from "./core/names.js";
import { openPlan } from "./core/setup.js";
import type { Tree } from "./core/tree.js";
import type { CreateOptions, GeneratorResult } from "./core/types.js";
import {
  renderBpEntityJson,
  renderClientEntity2dJson,
  renderClientEntity3dJson,
} from "./templates/entity.js";
import { planEquipment } from "./equipment.js";
import { planLoot } from "./loot.js";

const MARK = "#000000";
const MARK_OVER = "#ffffff";

export function planEntity(
  tree: Tree,
  config: BedrockConfig,
  opts: CreateOptions,
): GeneratorResult {
  const scope = openPlan(config, opts);
  const { raw, names: n, bpRel, rpRel } = scope;
  const sidecar = sidecarPlan(opts);

  const equipmentTable =
    sidecar.equipment !== null ? `loot_tables/entities/${raw}_equipment.json` : undefined;

  tree.write(
    `${bpRel}/entities/${raw}.json`,
    renderBpEntityJson({
      identifier: n.identifier,
      family: raw,
      ...(equipmentTable !== undefined ? { equipmentTable } : {}),
    }),
  );

  const notes: string[] = [];
  const texture = stripPng((opts.texture ?? `textures/entity/${raw}`).trim());
  if (isMode(opts.mode, "2d", "3d")) {
    tree.write(
      `${rpRel}/entity/${raw}.json`,
      renderClientEntity2dJson({
        identifier: n.identifier,
        geometry: "geometry.item_sprite",
        texture,
        baseColor: MARK,
        overlayColor: MARK_OVER,
      }),
    );
    notes.push(`2D entity: drop the sprite at ${texture}.png.`);
  } else {
    const { geometry } = modelRefs(opts, n.namespace, raw, `textures/entity/${raw}`);
    tree.write(
      `${rpRel}/entity/${raw}.json`,
      renderClientEntity3dJson({
        identifier: n.identifier,
        geometry,
        texture,
        baseColor: MARK,
        overlayColor: MARK_OVER,
      }),
    );
    notes.push(
      `3D entity: model goes in RP/models/entity/, texture at ${texture}.png, then wire animations plus scripts.animate yourself.`,
    );
  }

  writeLangTail(tree, rpRel, [
    [`entity.${n.identifier}.name`, n.displayName],
    [`item.spawn_egg.entity.${n.identifier}.name`, `Spawn ${n.displayName}`],
  ]);
  notes.push(`No spawn rules ship with this. Use the egg or /summon ${n.identifier}.`);

  if (sidecar.equipment !== null) {
    const out = planEquipment(tree, config, {
      ...opts,
      name: raw,
      result: `${n.namespace}:${raw}`,
    });
    notes.push(...out.notes);
  }
  if (sidecar.loot !== null) {
    const out = planLoot(tree, config, {
      ...opts,
      name: raw,
      lootKind: "entity",
      result: n.identifier,
    });
    notes.push(...out.notes);
  }

  return { notes };
}
