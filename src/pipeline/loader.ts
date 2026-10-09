import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { BedrockConfig, ExtensionConfig } from "../config.js";
import { logger } from "../logger.js";
import { defineProcessor, registerProcessor } from "./extensions.js";
import { createExtensionApi, withExtensionSettings } from "./extension-api.js";
import type { FileProcessor } from "./types.js";

export const PROJECT_EXTENSIONS_DIR = ".builder/extensions";
export const GLOBAL_EXTENSIONS_DIR = join(".bedrock-builder", "extensions");

export function repoSamplesDir(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "extensions");
}

function isRelativeSpecifier(spec: string): boolean {
  return (
    spec.startsWith("./") ||
    spec.startsWith("../") ||
    spec.startsWith(".\\") ||
    spec.startsWith("..\\") ||
    isAbsolute(spec)
  );
}

export async function discoverExtensions(dir: string): Promise<string[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const name of names.sort()) {
    const root = join(dir, name);
    const info = await stat(root).catch(() => null);
    if (!info?.isDirectory()) continue;
    const manifest = await readManifest(root);
    if (manifest) found.push(root);
  }
  return found;
}

interface ExtensionManifest {
  entry: string;
  dependencies?: Record<string, string>;
}

async function readJsonFile(path: string): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

// extension.json owns bb metadata, package.json owns npm deps.
// conflicting entries resolve to extension.json with a warning.
async function readManifest(root: string): Promise<ExtensionManifest | null> {
  const builderMeta = await readJsonFile(join(root, "extension.json"));
  const packageMeta = await readJsonFile(join(root, "package.json"));
  const builderEntry =
    typeof builderMeta?.entry === "string" && builderMeta.entry.trim() !== ""
      ? builderMeta.entry
      : undefined;
  const packageEntry = entryFromPackage(packageMeta);
  const entry = builderEntry ?? packageEntry;
  if (builderEntry && packageEntry && builderEntry !== packageEntry) {
    logger.warn(
      `extension entry conflict in ${root}: extension.json "${builderEntry}" wins over package.json "${packageEntry}"`,
    );
  }
  const dependencies = {
    ...depsFrom(packageMeta?.dependencies),
    ...depsFrom(builderMeta?.dependencies),
  };
  if (entry === undefined) {
    for (const fallback of ["index.mjs", "index.js"]) {
      const probe = await stat(join(root, fallback)).catch(() => null);
      if (probe?.isFile()) {
        return Object.keys(dependencies).length > 0
          ? { entry: fallback, dependencies }
          : { entry: fallback };
      }
    }
    return null;
  }
  return Object.keys(dependencies).length > 0 ? { entry, dependencies } : { entry };
}

function entryFromPackage(record: Record<string, unknown> | null): string | undefined {
  if (!record) return undefined;
  const exportEntry = exportTarget(record.exports);
  const entry =
    (record["bb"] as Record<string, unknown> | undefined)?.entry ?? record.main ?? exportEntry;
  return typeof entry === "string" && entry.trim() !== "" ? entry : undefined;
}

function depsFrom(raw: unknown): Record<string, string> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).filter(
      (pair): pair is [string, string] => typeof pair[1] === "string",
    ),
  );
}

function exportTarget(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  // exports maps nest the entry under the "." subpath.
  if ("." in record) return exportTarget(record["."]);
  for (const key of ["import", "node", "default"]) {
    if (typeof record[key] === "string") return record[key] as string;
  }
  return undefined;
}

function candidatePaths(spec: string, projectDir: string): string[] {
  if (isRelativeSpecifier(spec)) {
    const direct = resolve(projectDir, spec);
    return [direct, join(direct, "index.mjs"), join(direct, "index.js"), spec];
  }
  const local = resolve(projectDir, "node_modules", spec);
  const projectExt = join(projectDir, ...PROJECT_EXTENSIONS_DIR.split("/"), spec);
  const global = join(homedir(), GLOBAL_EXTENSIONS_DIR, spec);
  const repoSamples = join(repoSamplesDir(), spec);
  return [
    local,
    join(projectExt, "index.mjs"),
    join(projectExt, "index.js"),
    projectExt,
    join(global, "index.mjs"),
    join(global, "index.js"),
    global,
    join(repoSamples, "index.mjs"),
    join(repoSamples, "index.js"),
    repoSamples,
  ];
}

async function importModule(path: string): Promise<unknown> {
  return import(pathToFileURL(path).href);
}

async function fileExists(path: string): Promise<boolean> {
  const info = await stat(path).catch(() => null);
  return info?.isFile() ?? false;
}

export async function resolveExtensionPath(
  spec: string,
  projectDir: string,
): Promise<string | null> {
  for (const raw of candidatePaths(spec, projectDir)) {
    const path = isAbsolute(raw) ? raw : resolve(projectDir, raw);
    if (await fileExists(path)) return path;
    if (await presentDir(path)) {
      const manifest = await readManifest(path);
      if (manifest) return join(path, manifest.entry);
    }
  }
  return null;
}

async function presentDir(path: string): Promise<boolean> {
  const info = await stat(path).catch(() => null);
  return info?.isDirectory() ?? false;
}

export async function loadExtensions(config: BedrockConfig): Promise<ExtensionLoadReport> {
  const skipped: string[] = [];
  let loaded = 0;
  for (const raw of config.extensions ?? []) {
    const extension = normalizeExtension(raw);
    const count = await loadEntry(extension, config.__configDir);
    if (count === 0) skipped.push(extension.name);
    else loaded += count;
  }
  return { loaded, skipped };
}

function normalizeExtension(extension: ExtensionConfig | string): ExtensionConfig {
  return typeof extension === "string" ? { name: extension, settings: {} } : extension;
}

function toStages(
  module: unknown,
  spec: string,
  settings: Record<string, unknown> = {},
): FileProcessor[] {
  const exported =
    typeof module === "object" && module !== null && "default" in module
      ? (module as { default: unknown }).default
      : module;
  if (typeof exported === "function") {
    const out: unknown = (exported as (api: ReturnType<typeof createExtensionApi>) => unknown)(
      createExtensionApi(settings),
    );
    if (Array.isArray(out)) return out as FileProcessor[];
    if (out && typeof out === "object") return [out as FileProcessor];
    return [];
  }
  if (Array.isArray(exported)) return exported as FileProcessor[];
  if (exported && typeof exported === "object") return [exported as FileProcessor];
  throw new Error(`extension "${spec}" exports nothing usable`);
}

async function loadEntry(extension: ExtensionConfig, projectDir: string): Promise<number> {
  const { name: spec, settings } = extension;
  const path = await resolveExtensionPath(spec, projectDir);
  if (path === null) {
    logger.warn(`extension "${spec}" not found, skipping`);
    return 0;
  }
  let module: unknown;
  try {
    module = await importModule(path);
  } catch (err) {
    logger.warn(
      `extension "${spec}" failed to load (${path}): ${err instanceof Error ? err.message : String(err)}`,
    );
    return 0;
  }
  try {
    const stages = toStages(module, spec, settings).map((stage) =>
      withExtensionSettings(stage, settings),
    );
    for (const stage of stages) registerProcessor(stage);
    logger.debug(`extension loaded: ${spec} (${stages.length} processors)`);
    return stages.length;
  } catch (err) {
    logger.warn(
      `extension "${spec}" is invalid: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 0;
  }
}

export interface ExtensionLoadReport {
  loaded: number;
  skipped: string[];
}

export interface ExtensionStatus {
  spec: string;
  path: string | null;
  status: "ok" | "missing" | "broken";
  processors: string[];
  reason: string | null;
  missingDeps?: string[];
  checks?: ExtensionCheck[];
}

export interface ExtensionCheck {
  name: string;
  ok: boolean;
  detail: string;
  fix?: string;
}

// read the manifest for a known extension dir.
export async function readManifestFor(root: string): Promise<ExtensionManifest | null> {
  return readManifest(root);
}

// list declared deps missing from the extension's own node_modules.
export async function missingExtensionDeps(
  extensionRoot: string,
  dependencies: Record<string, string> | undefined,
): Promise<string[]> {
  if (!dependencies || Object.keys(dependencies).length === 0) return [];
  const missing: string[] = [];
  for (const name of Object.keys(dependencies)) {
    const marker = join(extensionRoot, "node_modules", ...name.split("/"), "package.json");
    if (!(await fileExists(marker))) missing.push(name);
  }
  return missing;
}

function npmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

// flags for extension-local installs. scripts stay off for safety.
export const EXTENSION_INSTALL_ARGS = ["install", "--ignore-scripts", "--no-audit", "--no-fund"];

// install one extension's deps into its own folder. never touches bb deps.
export async function installExtensionDeps(
  extensionRoot: string,
  dependencies: Record<string, string>,
): Promise<{ ok: boolean; output: string }> {
  try {
    const packagePath = join(extensionRoot, "package.json");
    const packageJson = await readPackageJson(packagePath);
    const next = {
      name: packageJson?.name ?? "bb-extension",
      version: packageJson?.version ?? "0.0.0",
      private: true,
      type: packageJson?.type ?? "module",
      ...packageJson,
      dependencies: {
        ...(packageJson?.dependencies ?? {}),
        ...dependencies,
      },
    };
    await writeFile(packagePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  } catch (err) {
    return {
      ok: false,
      output: `cannot prepare package.json: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  return new Promise((resolve) => {
    // npm.cmd needs a shell to spawn on windows node.
    const child = execFile(npmCommand(), EXTENSION_INSTALL_ARGS, {
      cwd: extensionRoot,
      shell: process.platform === "win32",
    });
    let output = "";
    child.stdout?.on("data", (chunk: Buffer | string) => {
      output += String(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      output += String(chunk);
    });
    child.on("error", (err: Error) => resolve({ ok: false, output: err.message }));
    child.on("close", (code) => resolve({ ok: code === 0, output: output.trim() }));
  });
}

async function readPackageJson(path: string): Promise<Record<string, any> | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, any>)
      : null;
  } catch {
    return null;
  }
}

// resolve an extension dir from a loaded entry path by walking up
// to the folder holding extension.json or package.json.
export async function extensionRootFor(entryPath: string): Promise<string | null> {
  let dir = dirname(entryPath);
  for (let depth = 0; depth < 4; depth++) {
    for (const file of ["extension.json", "package.json"]) {
      if (await fileExists(join(dir, file))) return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

export async function inspectExtensions(config: BedrockConfig): Promise<ExtensionStatus[]> {
  const out: ExtensionStatus[] = [];
  for (const raw of config.extensions ?? []) {
    const extension = normalizeExtension(raw);
    const spec = extension.name;
    const path = await resolveExtensionPath(spec, config.__configDir);
    if (path === null) {
      out.push({
        spec,
        path: null,
        status: "missing",
        processors: [],
        reason: "not found, skipping",
      });
      continue;
    }
    let module: unknown;
    try {
      module = await importModule(path);
    } catch (err) {
      out.push({
        spec,
        path,
        status: "broken",
        processors: [],
        reason: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    try {
      const stages = toStages(module, spec, extension.settings).map((stage) =>
        defineProcessor(stage),
      );
      const checks = await extensionChecks(module);
      const root = await extensionRootFor(path);
      const manifest = root ? await readManifest(root) : null;
      const missingDeps = root ? await missingExtensionDeps(root, manifest?.dependencies) : [];
      out.push({
        spec,
        path,
        status: "ok",
        processors: stages.map((stage) => stage.name),
        reason: null,
        ...(missingDeps.length > 0 ? { missingDeps } : {}),
        ...(checks.length > 0 ? { checks } : {}),
      });
    } catch (err) {
      out.push({
        spec,
        path,
        status: "broken",
        processors: [],
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return out;
}

async function extensionChecks(module: unknown): Promise<ExtensionCheck[]> {
  if (typeof module !== "object" || module === null) return [];
  const check = (module as { check?: unknown }).check;
  if (typeof check !== "function") return [];
  const result = await (check as () => unknown)();
  if (!Array.isArray(result)) return [];
  return result.filter(isExtensionCheck);
}

function isExtensionCheck(value: unknown): value is ExtensionCheck {
  if (typeof value !== "object" || value === null) return false;
  const check = value as Record<string, unknown>;
  return (
    typeof check.name === "string" &&
    typeof check.ok === "boolean" &&
    typeof check.detail === "string"
  );
}

export function projectExtensionsDir(config: BedrockConfig): string {
  return join(config.__configDir, ...PROJECT_EXTENSIONS_DIR.split("/"));
}

export function globalExtensionsDir(): string {
  return join(homedir(), ...GLOBAL_EXTENSIONS_DIR.split("/"));
}
