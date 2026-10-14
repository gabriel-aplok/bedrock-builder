import { renderArmorAttachableJson, renderWeaponAttachableJson } from "../templates/attachable.js";
import { renderItemJson } from "../templates/item.js";
import { renderRenderControllerJson } from "../templates/render_controller.js";
import { GenerateError } from "./errors.js";
import type { DerivedNames } from "./names.js";
import { stripPng } from "./names.js";
import { ensureLanguages, mergeItemTexture, mergeLang } from "./registries.js";
import type { Tree } from "./tree.js";

export function writeItemFeature(
  tree: Tree,
  bpRel: string,
  rpRel: string,
  raw: string,
  names: DerivedNames,
  icon: string,
  formatVersion: string,
  category: string,
  components: Record<string, unknown>,
): void {
  tree.write(
    `${bpRel}/items/${raw}.item.json`,
    renderItemJson({
      formatVersion,
      identifier: names.identifier,
      category,
      components,
    }),
  );
  mergeItemTexture(tree, rpRel, names.atlasKey, `textures/items/${icon}`);
  writeLangTail(tree, rpRel, [[`item.${names.identifier}`, names.displayName]]);
}

export interface SidecarPlan {
  recipe: string | null;
  loot: string | null;
  equipment: string | null;
}

export function sidecarPlan(opts: {
  recipe?: string | undefined;
  loot?: string | undefined;
  equipment?: string | undefined;
}): SidecarPlan {
  return {
    recipe: opts.recipe?.trim() ? opts.recipe.trim() : null,
    loot: opts.loot?.trim() ? opts.loot.trim() : null,
    equipment: opts.equipment?.trim() ? opts.equipment.trim() : null,
  };
}

export function iconNote(icon: string): string {
  return `Drop the icon PNG at RP/textures/items/${icon}.png`;
}

export function writeLangTail(
  tree: Tree,
  rpRel: string,
  lines: [key: string, value: string][],
): void {
  ensureLanguages(tree, rpRel);
  for (const [key, value] of lines) mergeLang(tree, rpRel, key, value);
}

export function isMode(mode: string | undefined, want: string, fallback: string): boolean {
  return (mode ?? fallback).toLowerCase() === want;
}

const BLOCK_RENDER_METHODS = new Set(["opaque", "blend", "alpha_test"]);

export function parseRenderMethod(raw: string): string {
  const mode = raw.toLowerCase();
  if (BLOCK_RENDER_METHODS.has(mode)) return mode;
  throw new GenerateError(`Unknown render method "${raw}". Pick opaque, blend, or alpha_test.`);
}

export function modelRefs(
  opts: { geometry?: string | undefined; texture?: string | undefined },
  namespace: string,
  raw: string,
  textureFallback: string,
): { geometry: string; texture: string } {
  return {
    geometry: (opts.geometry ?? `geometry.${namespace}.${raw}`).trim(),
    texture: stripPng((opts.texture ?? textureFallback).trim()),
  };
}

export interface AttachablePair {
  controller: string;
  animationPrefix?: string;
}

export function writeWeaponAttachable(
  tree: Tree,
  rpRel: string,
  raw: string,
  identifier: string,
  geometry: string,
  texture: string,
  controller: string,
  animationPrefix: string,
): void {
  tree.write(
    `${rpRel}/attachables/${raw}.attachable.json`,
    renderWeaponAttachableJson({
      identifier,
      geometry,
      texture,
      renderController: controller,
      animationPrefix,
    }),
  );
  tree.write(
    `${rpRel}/render_controllers/${raw}.rc.json`,
    renderRenderControllerJson({ id: controller }),
  );
}

export function writeArmorAttachable(
  tree: Tree,
  rpRel: string,
  raw: string,
  identifier: string,
  geometry: string,
  texture: string,
  controller: string,
): void {
  tree.write(
    `${rpRel}/attachables/${raw}.attachable.json`,
    renderArmorAttachableJson({
      identifier,
      geometry,
      texture,
      renderController: controller,
    }),
  );
  tree.write(
    `${rpRel}/render_controllers/${raw}.rc.json`,
    renderRenderControllerJson({ id: controller }),
  );
}
