// editor surface: esbuild-free entry so the bundled extension has no native deps.
export { loadConfig, loadConfigLenient } from "./config.js";
export type { BedrockConfig, ExtensionConfig, Draft } from "./config.js";

export { parseJsonc, stripJsonc } from "./jsonc.js";
export { isRecord } from "./records.js";
export { runBounded } from "./concurrency.js";
export { setJson, setVerbose } from "./logger.js";

export { checkScriptImports } from "./script-check.js";
export type { ScriptCheck } from "./script-check.js";

export { hoverCodeAt, minecraftNameOf, parseMinecraftLine } from "./minecraft-format.js";
export type { MinecraftSpan } from "./minecraft-format.js";

export { parseLang, findLangDuplicates, langKeyAt, translateKeyAt } from "./lang.js";
export type { LangEntry, LangProblem } from "./lang.js";

// node-builtin commands bundled so init works before builder install.
export { clean } from "./commands/clean.js";
export type { CleanOptions, CleanReport } from "./commands/clean.js";
export { create } from "./commands/create.js";
export { diff } from "./commands/diff.js";
export type { DiffOptions, DiffReport } from "./commands/diff.js";
export { doctor } from "./commands/doctor.js";
export type { DoctorCheck, DoctorOptions, DoctorReport } from "./commands/doctor.js";
export { importProject } from "./commands/import.js";
export type { ImportOptions, ImportReport } from "./commands/import.js";
export { init } from "./commands/init.js";
export type { InitOptions, InitReport } from "./commands/init.js";
export { manifest } from "./commands/manifest.js";
export type { ManifestOptions, ManifestReport } from "./commands/manifest.js";
export { report } from "./commands/report.js";
export type { HealthReport, ReportDuplicate, ReportOptions } from "./commands/report.js";
export { update } from "./commands/update.js";
export type { UpdateOptions, UpdateReport, UpdatedDep } from "./commands/update.js";
export { showVersion, version } from "./commands/version.js";
export type { VersionOptions, VersionReport } from "./commands/version.js";

export { CREATE_TYPES } from "./generate/core/types.js";
export type {
  CreateOptions,
  CreateType,
  GeneratorResult,
  PlannedFile,
} from "./generate/core/types.js";
