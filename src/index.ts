export { collectBuildStats } from "./build/stats.js";
export type { BuildStats, StatsRow } from "./build/stats.js";
export { build } from "./commands/build.js";
export type { BuildOptions, BuildReport } from "./commands/build.js";

export { clean } from "./commands/clean.js";
export type { CleanOptions, CleanReport } from "./commands/clean.js";
export { buildInitFiles } from "./commands/init-files.js";
export type { InitFile, InitInput } from "./commands/init-files.js";
export { InitError, init } from "./commands/init.js";
export type { InitOptions, InitReport } from "./commands/init.js";
export { ManifestError, manifest } from "./commands/manifest.js";
export type { ManifestOptions, ManifestReport } from "./commands/manifest.js";
export { VersionError, version } from "./commands/version.js";
export { UpdateError, update } from "./commands/update.js";
export { CompletionError, completion, parseCompletionShell } from "./commands/completion.js";
export type { CompletionShell } from "./commands/completion.js";
export { ImportError, importProject } from "./commands/import.js";
export type { ImportOptions, ImportReport } from "./commands/import.js";
export { BrarchiveError, brarchive, resolveServerDir } from "./commands/brarchive.js";
export type { BrarchiveOptions, BrarchiveReport } from "./commands/brarchive.js";
export type { UpdateOptions, UpdateReport, UpdatedDep } from "./commands/update.js";
export type { VersionOptions, VersionReport } from "./commands/version.js";
export { detectPackLayout, rewriteManifest, rewriteManifests } from "./manifest/rewrite.js";
export type {
  ManifestTarget,
  RewriteOptions,
  RewriteReport,
  RewrittenManifest,
} from "./manifest/rewrite.js";

export { BundlerError, buildBundle, buildBundleWithWatch, RUNTIME_MODULES } from "./bundler.js";
export type { BuildResult, BuildOptions as BundleBuildOptions } from "./bundler.js";

export { runBounded } from "./concurrency.js";
export { copyPackFile, copyPackFiles } from "./copier.js";
export { toPosix } from "./files/tree.js";
export { syncTree } from "./sync.js";
export { TypecheckError, parseDiagnostics, typecheck } from "./typecheck.js";
export { checkScriptImports } from "./script-check.js";
export type { ScriptCheck } from "./script-check.js";
export type { TypeDiagnostic, TypecheckResult } from "./typecheck.js";

export { BuildCache } from "./pipeline/cache.js";
export type { CacheEntry } from "./pipeline/cache.js";
export {
  clearProcessors,
  customProcessors,
  defineProcessor,
  registerProcessor,
  runBundleHooks,
  unregisterProcessor,
} from "./pipeline/extensions.js";
export {
  collectFiles,
  destRoot,
  isUnchanged,
  mapToDest,
  processFile,
  resolveProcessors,
  runPipeline,
  runPipelineFile,
} from "./pipeline/index.js";
export type {
  BundleContext,
  FileProcessor,
  PipelineFile,
  ProcessorContext,
} from "./pipeline/index.js";
export {
  EXTENSION_INSTALL_ARGS,
  discoverExtensions,
  extensionRootFor,
  globalExtensionsDir,
  inspectExtensions,
  installExtensionDeps,
  loadExtensions,
  missingExtensionDeps,
  projectExtensionsDir,
  readManifestFor,
  repoSamplesDir,
  resolveExtensionPath,
  type ExtensionLoadReport,
  type ExtensionCheck,
  type ExtensionStatus,
} from "./pipeline/loader.js";
export type { ExtensionApi } from "./pipeline/extension-api.js";
export { defaultProcessors } from "./pipeline/processors/index.js";
export {
  SaveBatcher,
  WATCH_DEBOUNCE_MS,
  createPackWatcher,
  isIgnoredBy,
  isSkippedDir,
  isTempFile,
  loadIgnoreFile,
  parseIgnoreFile,
  timestamp,
  waitForReady,
} from "./watcher.js";
export type { IgnoreRules, WatchEvent } from "./watcher.js";

export { startWatch, watch } from "./commands/watch.js";
export type { WatchOptions, WatchSession } from "./commands/watch.js";
export { watchTypes } from "./typewatch.js";
export type { TypeWatcher } from "./typewatch.js";

export { deploy, startDeployWatch } from "./commands/deploy.js";
export type { DeployOptions, DeploySession } from "./commands/deploy.js";

export { extensions } from "./commands/extensions.js";

export { HarnessError, harness } from "./commands/harness.js";
export type { HarnessOptions, HarnessReport } from "./commands/harness.js";

export { pack } from "./commands/pack.js";
export type { PackOptions, PackReport } from "./commands/pack.js";

export { doctor } from "./commands/doctor.js";
export type { DoctorCheck, DoctorOptions, DoctorReport } from "./commands/doctor.js";

export {
  BP_FOLDERS,
  RP_FOLDERS,
  createFolders,
  folders,
  listFolderOptions,
} from "./commands/folders.js";
export type { FolderDef, FolderOption } from "./commands/folders.js";

export { create } from "./commands/create.js";

export { GenerateError } from "./generate/core/errors.js";
export { CREATE_TYPES } from "./generate/core/types.js";
export type {
  CreateOptions,
  CreateType,
  GeneratorResult,
  PlannedFile,
} from "./generate/core/types.js";

export { planAnimation } from "./generate/animation.js";
export { planArmor } from "./generate/armor.js";
export { planBiome } from "./generate/biome.js";
export { planBiomesClient } from "./generate/biomes_client.js";
export { planBlock } from "./generate/block.js";
export { planBlockCulling } from "./generate/block_culling.js";
export { planCamera } from "./generate/camera.js";
export { planDialogue } from "./generate/dialogue.js";
export { planDimension } from "./generate/dimension.js";
export { planEntity } from "./generate/entity.js";
export { planEquipment } from "./generate/equipment.js";
export { planFeature } from "./generate/feature.js";
export { planFeatureRule } from "./generate/feature_rule.js";
export { planFog } from "./generate/fog.js";
export { planFunction } from "./generate/function.js";
export { planItem } from "./generate/item.js";
export { planItemCatalog } from "./generate/item_catalog.js";
export { planLoot } from "./generate/loot.js";
export { planLootTable } from "./generate/loot_table.js";
export { planParticle } from "./generate/particle.js";
export { planRecipe } from "./generate/recipe.js";
export { planSound } from "./generate/sound.js";
export { planSpawn } from "./generate/spawn.js";
export { planTool } from "./generate/tool.js";
export { planTrade } from "./generate/trade.js";
export { planUi } from "./generate/ui.js";
export { planVoxelShape } from "./generate/voxel_shape.js";
export { planWeapon } from "./generate/weapon.js";

export {
  deriveNamespace,
  validateIdentifier,
  validateName,
  validateNamespace,
} from "./generate/core/identifier.js";
export { deriveNames, stripPng, toDisplayName } from "./generate/core/names.js";
export { hasConflict, planTree } from "./generate/core/plan.js";
export {
  ensureLanguages,
  mergeBiomeClient,
  mergeBlocks,
  mergeItemTexture,
  mergeLang,
  mergeSoundDefinition,
  mergeTerrainTexture,
  mergeUiDefs,
} from "./generate/core/registries.js";
export { Tree } from "./generate/core/tree.js";

export { ConfigError, loadConfig, loadConfigLenient, validateConfig } from "./config.js";
export type { BedrockConfig, ExtensionConfig } from "./config.js";

export {
  DeployTargetError,
  resolveDeployTarget,
  setHomeForTests,
  setPlatformForTests,
} from "./paths.js";
export type { DeployTargets } from "./paths.js";

export { isJson, logger, printJson, setJson, setVerbose } from "./logger.js";

export { isRecord } from "./records.js";
