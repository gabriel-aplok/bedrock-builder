import * as vscode from "vscode";

import {
  CATALOG_FILE,
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
import { fetchRegistry, resolveVersion } from "./schemaVersion.js";

export interface SchemaState {
  version: string;
  store: vscode.Uri;
}

// download Mojang schemas for the wanted version and wire them into
// json.schemas for this workspace folder. managed rows are replaced,
// user rows are kept.
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
  await writeJsonSchemas(settings, store, catalog);
  status.text = `${STATUS_TEXT_PREFIX}: ${version}`;
  return { version, store };
}

async function writeJsonSchemas(
  settings: vscode.WorkspaceConfiguration,
  store: vscode.Uri,
  catalog: SchemaCatalog,
): Promise<void> {
  const rows = catalogToLocalSchemas(catalog);
  const managed = rows.flatMap((row) => {
    const local = storePathForSchemaUrl(row.url);
    if (!local) return [];
    const target = vscode.Uri.joinPath(store, ...local.split("/")).toString();
    return [
      {
        fileMatch: row.fileMatch.map((glob) => toPackGlob(glob)),
        url: target,
        [MANAGED_KEY]: true,
      },
    ];
  });
  const current = settings.get<unknown[]>(SETTING_JSON_SCHEMAS, []);
  const kept = Array.isArray(current) ? current.filter((row) => !isManaged(row)) : [];
  await settings.update(
    SETTING_JSON_SCHEMAS,
    [...kept, ...managed],
    vscode.ConfigurationTarget.WorkspaceFolder,
  );
}

// Mojang globs match any folder depth, scope them to the pack dirs so
// BP entity schemas do not fire on RP files with the same layout.
function toPackGlob(glob: string): string {
  if (glob.startsWith("**/")) return `**/packs/*/${glob.slice(3)}`;
  return `**/packs/*/${glob}`;
}

import { isRecord } from "@aplok/bedrock-builder";

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
    const rest = entry.name.slice(`${PACKAGE_PREFIX}schemas/`.length);
    const dest = vscode.Uri.joinPath(store, "schemas", ...rest.split("/"));
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(dest, ".."));
    await vscode.workspace.fs.writeFile(dest, entry.data);
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function showError(text: string): void {
  void vscode.window.showErrorMessage(`${OUTPUT_NAME}: ${text}`);
}
