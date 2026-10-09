// validate the entry script's @minecraft imports. the bundler
// marks these modules external, so a typo sails through the
// build and only fails inside the game. this check catches
// unknown modules plus manifest and install version drift.
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { RUNTIME_MODULES } from "./bundler.js";
import { isRecord } from "./records.js";
import { manifestVersion } from "./pipeline/manifest.js";

export interface ScriptCheck {
  ok: boolean;
  detail: string;
  fix: string | null;
}

const IMPORT =
  /(?:from\s+["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|require\s*\(\s*["']([^"']+)["']\s*\))/g;

function entryImports(source: string): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(IMPORT)) {
    const spec = match[1] ?? match[2] ?? match[3] ?? "";
    if (spec.startsWith("@minecraft/")) found.add(spec);
  }
  return [...found];
}

function major(version: string): string {
  return version.replace(/^[^\d]*/, "").split(".")[0] ?? "";
}

async function readJson(path: string): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function manifestServerVersion(manifest: Record<string, unknown> | null): string | null {
  const deps = manifest?.dependencies;
  if (!Array.isArray(deps)) return null;
  for (const dep of deps) {
    if (!isRecord(dep)) continue;
    if (dep.module_name === "@minecraft/server") {
      return manifestVersion(dep.version);
    }
  }
  return null;
}

async function installedServerVersion(configDir: string): Promise<string | null> {
  const installed = await readJson(
    join(configDir, "node_modules", "@minecraft", "server", "package.json"),
  );
  if (typeof installed?.version === "string") return installed.version;
  const pkg = await readJson(join(configDir, "package.json"));
  const deps = pkg?.dependencies;
  const devDeps = pkg?.devDependencies;
  const range =
    (typeof deps === "object" && deps !== null
      ? (deps as Record<string, unknown>)["@minecraft/server"]
      : undefined) ??
    (typeof devDeps === "object" && devDeps !== null
      ? (devDeps as Record<string, unknown>)["@minecraft/server"]
      : undefined);
  return typeof range === "string" ? range : null;
}

export async function checkScriptImports(
  entryAbs: string,
  configDir: string,
  bpManifestAbs: string,
): Promise<ScriptCheck> {
  let source: string;
  try {
    source = await readFile(entryAbs, "utf8");
  } catch {
    return { ok: true, detail: "skipped, entry missing", fix: null };
  }
  const imports = entryImports(source);
  if (imports.length === 0) {
    return { ok: true, detail: "no runtime imports", fix: null };
  }
  const known = new Set(RUNTIME_MODULES);
  const unknown = imports.filter((spec) => !known.has(spec));
  if (unknown.length > 0) {
    return {
      ok: false,
      detail: `unknown runtime module ${unknown.join(", ")}`,
      fix: `Import one of ${RUNTIME_MODULES.join(", ")}.`,
    };
  }
  if (!imports.includes("@minecraft/server")) {
    return { ok: true, detail: imports.join(", "), fix: null };
  }
  const manifest = await readJson(bpManifestAbs);
  const manifestVersion = manifestServerVersion(manifest);
  if (manifestVersion === null) {
    return {
      ok: false,
      detail: "entry imports @minecraft/server but the BP manifest has no matching dependency",
      fix: 'Add { "module_name": "@minecraft/server", "version": "x.y.z" } to the BP manifest dependencies.',
    };
  }
  const installed = await installedServerVersion(configDir);
  if (installed !== null && major(installed) !== major(manifestVersion)) {
    return {
      ok: false,
      detail: `manifest declares @minecraft/server ${manifestVersion} but ${installed} is installed`,
      fix: "Align the BP manifest dependency with the installed @minecraft/server major version.",
    };
  }
  return { ok: true, detail: `@minecraft/server ${manifestVersion}`, fix: null };
}
