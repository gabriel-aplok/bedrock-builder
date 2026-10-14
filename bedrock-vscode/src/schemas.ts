import * as vscode from "vscode";

import { resolveProject } from "./config.js";
import {
  CATALOG_FILE,
  COMMAND_FORMS_PREFIX,
  MOLANG_FORMS_PREFIX,
  MANAGED_KEY,
  OUTPUT_NAME,
  PACKAGE_PREFIX,
  SETTING_JSON_SCHEMAS,
  SETTING_SCHEMA_VERSION,
  STATUS_TEXT_PREFIX,
  tarballUrl,
} from "./constants.js";
import {
  catalogToLocalSchemas,
  parseTarball,
  storePathForSchemaUrl,
  type SchemaCatalog,
} from "./schemaStore.js";
import { healSchemaJson } from "./schemaHeal.js";
import { fetchRegistry, resolveVersion } from "./schemaVersion.js";

export interface SchemaState {
  version: string;
  store: vscode.Uri;
}

// download mojang schemas and register them in the ide json settings.
export async function ensureSchemas(
  context: vscode.ExtensionContext,
  status: vscode.StatusBarItem,
  reason: string,
): Promise<SchemaState | undefined> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return undefined;
  const settings = vscode.workspace.getConfiguration(undefined, folder.uri);
  const wanted = settings.get<string>(SETTING_SCHEMA_VERSION, "latest");
  let version: string;
  try {
    version = resolveVersion(wanted, await fetchRegistry());
  } catch (err) {
    status.text = `${STATUS_TEXT_PREFIX}: version error`;
    showError(`${messageOf(err)} (${reason})`);
    return undefined;
  }
  const store = vscode.Uri.joinPath(
    context.globalStorageUri,
    "minecraft",
    version,
    "bedrock-schemas",
  );
  const catalogUri = vscode.Uri.joinPath(store, "catalog.json");
  if (!(await exists(catalogUri))) {
    status.text = `${STATUS_TEXT_PREFIX}: downloading ${version}`;
    try {
      await downloadSchemas(store, version);
    } catch (err) {
      status.text = `${STATUS_TEXT_PREFIX}: download failed`;
      showError(`schema download failed: ${messageOf(err)}`);
      return undefined;
    }
  }
  const catalog = await readCatalog(catalogUri);
  if (!catalog) {
    status.text = `${STATUS_TEXT_PREFIX}: catalog unreadable`;
    return undefined;
  }
  await healStore(store);
  // pack dirs come from config if present; otherwise raw Mojang globs match anywhere.
  const packs = await packDirsFor().catch(() => undefined);
  await writeJsonSchemas(settings, store, catalog, packs);
  status.text = `${STATUS_TEXT_PREFIX}: ${version}`;
  return { version, store };
}

async function writeJsonSchemas(
  settings: vscode.WorkspaceConfiguration,
  store: vscode.Uri,
  catalog: SchemaCatalog,
  packs: { bp: string; rp: string } | undefined,
): Promise<void> {
  const rows = catalogToLocalSchemas(catalog);
  const managed = rows.flatMap((row) => {
    const local = storePathForSchemaUrl(row.url);
    if (!local) return [];
    const target = vscode.Uri.joinPath(store, ...local.split("/")).toString();
    return [
      {
        fileMatch: row.fileMatch.map((glob) => toPackGlob(glob, sideOf(row.url), packs)),
        url: target,
        [MANAGED_KEY]: true,
      },
    ];
  });
  const current = settings.get<unknown[]>(SETTING_JSON_SCHEMAS, []);
  const kept = Array.isArray(current) ? current.filter((row) => !isManaged(row)) : [];
  // update user settings only, keeping globs pack-scoped.
  await settings.update(
    SETTING_JSON_SCHEMAS,
    [...kept, ...managed],
    vscode.ConfigurationTarget.Global,
  );
  await clearFolderSchemas(settings);
}

// drop rows a previous version wrote into folder settings, so schemas never register twice.
async function clearFolderSchemas(settings: vscode.WorkspaceConfiguration): Promise<void> {
  const detail = settings.inspect<unknown[]>(SETTING_JSON_SCHEMAS);
  const folderRows = detail?.workspaceFolderValue;
  if (!Array.isArray(folderRows) || !folderRows.some(isManaged)) return;
  await settings.update(
    SETTING_JSON_SCHEMAS,
    folderRows.filter((row) => !isManaged(row)),
    vscode.ConfigurationTarget.WorkspaceFolder,
  );
}

// scope mojang globs to the configured BP/RP dirs.
export function toPackGlob(
  glob: string,
  side: "bp" | "rp" | undefined,
  packs: { bp: string; rp: string } | undefined,
): string {
  const dir = side === "bp" ? packs?.bp : side === "rp" ? packs?.rp : undefined;
  if (dir === undefined || dir === "") return glob;
  if (glob.startsWith("**/")) return `**/${dir}/${glob.slice(3)}`;
  return `**/${dir}/${glob}`;
}

// catalog urls are side prefixed: ./schemas/bp/... or ./schemas/rp/...
export function sideOf(url: string): "bp" | "rp" | undefined {
  if (url.startsWith("./schemas/bp/")) return "bp";
  if (url.startsWith("./schemas/rp/")) return "rp";
  return undefined;
}

// pack dirs relative to the workspace folder, posix; undefined if absent or escaping.
async function packDirsFor(): Promise<{ bp: string; rp: string } | undefined> {
  const project = await resolveProject();
  const base = project.folder.uri.fsPath.replace(/\\/g, "/");
  const rel = (abs: string): string | undefined => {
    const norm = abs.replace(/\\/g, "/");
    const path = norm.startsWith(`${base}/`) ? norm.slice(base.length + 1) : undefined;
    if (path === undefined || path === "" || path.split("/").includes("..")) return undefined;
    return path;
  };
  const bp = rel(project.config.packs.bp);
  const rp = rel(project.config.packs.rp);
  if (bp === undefined || rp === undefined) return undefined;
  return { bp, rp };
}

import { isRecord } from "@aplok/bedrock-builder/editor";

function isManaged(row: unknown): boolean {
  return isRecord(row) && row[MANAGED_KEY] === true;
}

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

async function readCatalog(uri: vscode.Uri): Promise<SchemaCatalog | undefined> {
  try {
    const raw = await vscode.workspace.fs.readFile(uri);
    const parsed: unknown = JSON.parse(Buffer.from(raw).toString("utf8"));
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !Array.isArray((parsed as { schemas?: unknown }).schemas)
    )
      return undefined;
    return parsed as SchemaCatalog;
  } catch {
    return undefined;
  }
}

async function downloadSchemas(store: vscode.Uri, version: string): Promise<void> {
  const res = await fetch(tarballUrl(version));
  if (!res.ok) throw new Error(`tarball ${res.status}`);
  const entries = parseTarball(Buffer.from(await res.arrayBuffer()));
  await vscode.workspace.fs.createDirectory(store);
  for (const entry of entries) {
    if (entry.name === CATALOG_FILE) {
      await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(store, "catalog.json"), entry.data);
      continue;
    }
    // command and molang forms live beside the schemas and power mcfunction completion.
    const base =
      entry.name.startsWith(COMMAND_FORMS_PREFIX) && entry.name.endsWith(".form.json")
        ? "forms/command/"
        : entry.name.startsWith(MOLANG_FORMS_PREFIX) && entry.name.endsWith(".form.json")
          ? "forms/molang/"
          : "schemas/";
    const rest = entry.name.slice(`${PACKAGE_PREFIX}${base}`.length);
    if (rest.split("/").some((part) => part === ".." || part === "")) continue;
    const dest = vscode.Uri.joinPath(store, ...base.split("/").filter(Boolean), ...rest.split("/"));
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(dest, ".."));
    await vscode.workspace.fs.writeFile(dest, entry.data);
  }
}

// heal the store once per version: drop relative $ids, use renamed copies, drop missing refs.
const HEAL_MARKER = "schemas/.healed-v2";
const HEAL_ALIASES: Readonly<Record<string, string>> = {
  "schemas/common/expression.schema.json": "schemas/common/molang_expression.schema.json",
};

async function healStore(store: vscode.Uri): Promise<void> {
  const marker = vscode.Uri.joinPath(store, ...HEAL_MARKER.split("/"));
  if (await exists(marker)) return;
  const files = await listStoreJson(store);
  const present = new Set(files);
  for (const [target, source] of Object.entries(HEAL_ALIASES)) {
    if (present.has(target) || !present.has(source)) continue;
    try {
      const raw = await vscode.workspace.fs.readFile(
        vscode.Uri.joinPath(store, ...source.split("/")),
      );
      await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(store, ...target.split("/")), raw);
      present.add(target);
    } catch {}
  }
  for (const file of files) {
    let text: string;
    try {
      const raw = await vscode.workspace.fs.readFile(
        vscode.Uri.joinPath(store, ...file.split("/")),
      );
      text = Buffer.from(raw).toString("utf8");
    } catch {
      continue;
    }
    const next = healSchemaJson(file, text, present);
    if (next === text) continue;
    try {
      await vscode.workspace.fs.writeFile(
        vscode.Uri.joinPath(store, ...file.split("/")),
        Buffer.from(next, "utf8"),
      );
    } catch {}
  }
  try {
    await vscode.workspace.fs.writeFile(marker, Buffer.from("healed", "utf8"));
  } catch {}
}

// store-relative json paths under schemas/, posix separators.
async function listStoreJson(store: vscode.Uri): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(
        vscode.Uri.joinPath(store, ...dir.split("/")),
      );
    } catch {
      return;
    }
    for (const [name, kind] of entries) {
      const rel = dir === "schemas" ? `schemas/${name}` : `${dir}/${name}`;
      if (kind === vscode.FileType.Directory) {
        await walk(rel);
      } else if (name.endsWith(".json")) {
        out.push(rel);
      }
    }
  };
  await walk("schemas");
  return out;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function showError(text: string): void {
  void vscode.window.showErrorMessage(`${OUTPUT_NAME}: ${text}`);
}
