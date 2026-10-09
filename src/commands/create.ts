import * as p from "@clack/prompts";
import pc from "picocolors";

import type { BedrockConfig } from "../config.js";
import { planAnimation } from "../generate/animation.js";
import { planArmor } from "../generate/armor.js";
import { planBiome } from "../generate/biome.js";
import { planBiomesClient } from "../generate/biomes_client.js";
import { planBlock } from "../generate/block.js";
import { planBlockCulling } from "../generate/block_culling.js";
import { planCamera } from "../generate/camera.js";
import { GenerateError } from "../generate/core/errors.js";
import { validateNamespace } from "../generate/core/identifier.js";
import { hasConflict, planTree } from "../generate/core/plan.js";
import { Tree } from "../generate/core/tree.js";
import {
  CREATE_TYPES,
  type CreateOptions,
  type CreateType,
  type PlannedFile,
} from "../generate/core/types.js";
import { planDialogue } from "../generate/dialogue.js";
import { planDimension } from "../generate/dimension.js";
import { planEntity } from "../generate/entity.js";
import { planEquipment } from "../generate/equipment.js";
import { planFeature } from "../generate/feature.js";
import { planFeatureRule } from "../generate/feature_rule.js";
import { planFog } from "../generate/fog.js";
import { planFunction } from "../generate/function.js";
import { planItem } from "../generate/item.js";
import { planItemCatalog } from "../generate/item_catalog.js";
import { planLoot } from "../generate/loot.js";
import { planParticle } from "../generate/particle.js";
import { planRecipe } from "../generate/recipe.js";
import { planSound } from "../generate/sound.js";
import { planSpawn } from "../generate/spawn.js";
import { planTool } from "../generate/tool.js";
import { planTrade } from "../generate/trade.js";
import { planUi } from "../generate/ui.js";
import { planVoxelShape } from "../generate/voxel_shape.js";
import { planWeapon } from "../generate/weapon.js";
import { logger } from "../logger.js";
import { AbortError, askOptions, isKnownType } from "./create-prompts.js";

type Planner = (tree: Tree, config: BedrockConfig, opts: CreateOptions) => { notes: string[] };

const PLANNERS: Record<CreateType, Planner> = {
  weapon: planWeapon,
  tool: planTool,
  armor: planArmor,
  item: planItem,
  entity: planEntity,
  block: planBlock,
  recipe: planRecipe,
  loot: planLoot,
  spawn: planSpawn,
  trade: planTrade,
  dialogue: planDialogue,
  animation: planAnimation,
  equipment: planEquipment,
  feature: planFeature,
  feature_rule: planFeatureRule,
  particle: planParticle,
  fog: planFog,
  function: planFunction,
  voxel_shape: planVoxelShape,
  biome: planBiome,
  camera: planCamera,
  item_catalog: planItemCatalog,
  sound: planSound,
  biomes_client: planBiomesClient,
  block_culling: planBlockCulling,
  dimension: planDimension,
  ui: planUi,
};

export async function create(config: BedrockConfig, opts: CreateOptions): Promise<void> {
  const interactive = Boolean(process.stdout.isTTY) && !opts.yes && !runsOnCI();

  const ns = validateNamespace(config.namespace);
  if (ns !== true) {
    throw new GenerateError(
      `Project namespace "${config.namespace}" is invalid: ${ns} Set bb.namespace in config.json.`,
    );
  }

  let resolved: CreateOptions;
  if (opts.list ?? false) {
    showTypes(interactive);
    return;
  }
  if (interactive) {
    try {
      resolved = await askOptions(config, opts);
    } catch (err) {
      if (err instanceof AbortError) return;
      throw err;
    }
  } else {
    resolved = checkFlags(opts);
  }
  const type = resolved.type!;

  const tree = new Tree(config.__configDir);
  const outcome = PLANNERS[type](tree, config, resolved);
  const plan = planTree(tree, Boolean(resolved.force));

  if (resolved.dryRun) {
    showDryRun(plan, interactive);
    return;
  }

  if (hasConflict(plan)) {
    reportConflicts(plan, interactive);
    throw new GenerateError("Conflicting files, use --force to overwrite.");
  }

  await tree.flush();
  const tally = countChanges(plan);
  if (interactive) {
    const spin = p.spinner();
    spin.start("Writing files");
    spin.stop("Files written");
    p.log.success(tally);
    if (outcome.notes.length > 0) p.note(outcome.notes.join("\n\n"), "Next steps");
    p.outro(pc.green(`done: ${type} ${resolved.name}`));
  } else {
    logger.info(tally);
    for (const note of outcome.notes) logger.info(note);
    logger.success(`done: ${type} ${resolved.name}`);
  }
}

function runsOnCI(): boolean {
  return (
    process.env.CI === "true" ||
    process.env.CI === "1" ||
    process.env.CONTINUOUS_INTEGRATION === "true" ||
    process.env.GITHUB_ACTIONS === "true"
  );
}

function checkFlags(opts: CreateOptions): CreateOptions {
  const type = opts.type;
  if (!type || !isKnownType(type)) {
    throw new GenerateError(`Unknown type. Usage: bb new <${CREATE_TYPES.join("|")}> <name>`);
  }
  const name = opts.name?.trim() ?? "";
  if (name === "") {
    throw new GenerateError(
      `A name is required. Run: bb new ${type} <name> (for example: bb new ${type} fire_sword)`,
    );
  }
  return { ...opts, type, name };
}

function showTypes(interactive: boolean): void {
  const title = `Generator types (${CREATE_TYPES.length}):`;
  const rows = CREATE_TYPES.map((type) => `  ${type}`).join("\n");
  if (interactive) {
    p.log.message(pc.bold(title));
    for (const type of CREATE_TYPES) p.log.message(`  ${type}`);
  } else {
    process.stdout.write(`${title}\n${rows}\n`);
  }
}

function showDryRun(plan: readonly PlannedFile[], interactive: boolean): void {
  const title = "Dry run, nothing will be written:";
  if (interactive) p.log.message(pc.bold(title));
  else process.stdout.write(`${title}\n`);
  showPlan(plan);
  if (interactive) p.outro(pc.dim("Re-run without --dry-run to apply."));
  else logger.info("Re-run without --dry-run to apply.");
}

function reportConflicts(plan: readonly PlannedFile[], interactive: boolean): void {
  const rows = plan.filter((file) => file.status === "conflict");
  if (interactive) {
    p.log.warn("Conflicts, nothing was written:");
    for (const file of rows) p.log.message(planRow(file));
    p.cancel("Re-run with --force to overwrite, or --dry-run to preview.");
  } else {
    logger.error("Conflicts, nothing was written:");
    showPlan(rows);
    logger.error("Re-run with --force to overwrite, or --dry-run to preview.");
  }
}

function countChanges(plan: readonly PlannedFile[]): string {
  const tally = (status: PlannedFile["status"]) =>
    plan.filter((file) => file.status === status).length;
  const parts: string[] = [];
  const created = tally("create");
  const over = tally("overwrite");
  const merged = tally("update");
  const kept = tally("skip");
  if (created) parts.push(`${created} created`);
  if (over) parts.push(`${over} overwritten`);
  if (merged) parts.push(`${merged} registry updated`);
  if (kept) parts.push(`${kept} unchanged`);
  return parts.join(", ") || "no changes";
}

function planRow(file: PlannedFile): string {
  const size = `${Buffer.byteLength(file.nextContent, "utf8")} B`;
  switch (file.status) {
    case "create":
      return `  ${pc.green("create")}  ${file.relPath} ${pc.dim(`(${size})`)}`;
    case "overwrite":
      return `  ${pc.yellow("overwrite")}  ${file.relPath} ${pc.dim(`(${size})`)}`;
    case "update":
      return `  ${pc.cyan("update")}  ${file.relPath} ${pc.dim(`(merged, ${size})`)}`;
    case "skip":
      return `  ${pc.dim("skip")}  ${file.relPath} ${pc.dim("(unchanged)")}`;
    case "conflict":
      return `  ${pc.red("conflict")}  ${file.relPath} ${pc.dim("(differs, use --force)")}`;
  }
}

function showPlan(plan: readonly PlannedFile[]): void {
  for (const file of plan) process.stdout.write(`${planRow(file)}\n`);
}
