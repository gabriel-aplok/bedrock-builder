import * as vscode from "vscode";

import { runBounded } from "@aplok/bedrock-builder/editor";

import { resolveProject } from "./config.js";
import {
  INDEX_READ_FANOUT,
  MAX_COMPLETIONS,
  MAX_INDEX_FILES,
  MAX_INDEX_VALUES,
} from "./constants.js";
import { packJsonFiles, readCapped } from "./goto.js";
import { loadMolang, molangScope } from "./molang.js";

export interface IndexEntry {
  kind: "identifier" | "component" | "geometry" | "variable";
  file: vscode.Uri;
  line: number;
}

// values schemas never know: custom ids, namespaced keys,
// geometry/controller/animation names, molang vars.
const IDENTIFIER_DEF = /"identifier"\s*:\s*"([^"]+)"/g;
const COMPONENT_KEY = /"([A-Za-z0-9_.-]+:[A-Za-z0-9_./-]+)"\s*:/g;
const GEO_NAME = /"((?:geometry|controller|animation)\.[\w.]+)"/g;
const VAR_NAME = /"((?:variable|v|t|c|temp|context|array|geometry|texture|material)\.[\w.]+)"/g;

// single cached index per session; rebuilt lazily, marked dirty on a save.
const entries = new Map<string, IndexEntry>();
let roots: string[] = [];
let built = false;
let dirty = false;
let building: Promise<void> | undefined;

export function markCompletionsDirty(document: vscode.TextDocument): void {
  if (document.languageId === "json" || document.languageId === "jsonc") dirty = true;
}

export async function refreshCompletions(): Promise<number> {
  await buildIndex();
  return entries.size;
}

async function buildIndex(): Promise<void> {
  if (building) {
    await building;
    return;
  }
  building = (async () => {
    entries.clear();
    roots = await packRoots().catch(() => []);
    const files = (await packJsonFiles()).slice(0, MAX_INDEX_FILES);
    await runBounded(files, INDEX_READ_FANOUT, async (file) => {
      const text = await readCapped(file);
      if (text === undefined) return;
      collect(text, file, IDENTIFIER_DEF, "identifier");
      collect(text, file, COMPONENT_KEY, "component");
      collect(text, file, GEO_NAME, "geometry");
      collect(text, file, VAR_NAME, "variable");
    });
    built = true;
    dirty = false;
  })();
  try {
    await building;
  } finally {
    building = undefined;
  }
}

function collect(text: string, file: vscode.Uri, pattern: RegExp, kind: IndexEntry["kind"]): void {
  pattern.lastIndex = 0;
  for (const hit of text.matchAll(pattern)) {
    if (entries.size >= MAX_INDEX_VALUES) return;
    const value = hit[1]!;
    if (!entries.has(value)) {
      entries.set(value, { kind, file, line: lineOf(text, hit.index ?? 0) });
    }
  }
}

function lineOf(text: string, index: number): number {
  let line = 0;
  for (let at = 0; at < index; at++) if (text[at] === "\n") line++;
  return line;
}

// pack roots for scoping; empty means completion works everywhere.
async function packRoots(): Promise<string[]> {
  const project = await resolveProject();
  return [project.config.packs.bp, project.config.packs.rp].map((root) => root.replace(/\\/g, "/"));
}

function inRoots(fsPath: string): boolean {
  if (roots.length === 0) return true;
  const norm = fsPath.replace(/\\/g, "/");
  return roots.some((root) => norm === root || norm.startsWith(`${root}/`));
}
// string prefix before the cursor; `"some:par` yields `some:par`.
function prefixAt(document: vscode.TextDocument, position: vscode.Position): string | undefined {
  const before = document.lineAt(position.line).text.slice(0, position.character);
  const hit = /"([\w.:/-]*)$/.exec(before);
  return hit ? hit[1]! : undefined;
}

// table value prefix before the cursor; `"table": "loot_t` yields `loot_t`.
export function tablePrefixAt(
  document: vscode.TextDocument,
  position: vscode.Position,
): string | undefined {
  const before = document.lineAt(position.line).text.slice(0, position.character);
  const hit = /"table"\s*:\s*"([^"]*)$/.exec(before);
  return hit ? hit[1]! : undefined;
}

async function tableRoot(document: vscode.TextDocument): Promise<string | undefined> {
  try {
    return (await resolveProject()).config.packs.bp;
  } catch {
    const folder = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath;
    return folder ? `${folder.replace(/\\/g, "/")}/packs/BP` : undefined;
  }
}

// loot table paths relative to the BP root, extension stripped
// to match the `"table"` convention. scoped to BP only.
async function tableItems(
  document: vscode.TextDocument,
  prefix: string,
): Promise<vscode.CompletionItem[]> {
  const root = await tableRoot(document);
  if (!root) return [];
  const norm = root.replace(/\\/g, "/");
  const pattern = new vscode.RelativePattern(norm, "**/*.json");
  const uris = await vscode.workspace.findFiles(pattern, "**/node_modules/**", MAX_COMPLETIONS);
  const out: vscode.CompletionItem[] = [];
  for (const uri of uris) {
    const rel = uri.fsPath
      .replace(/\\/g, "/")
      .replace(norm + "/", "")
      .replace(/\.json$/, "");
    if (rel === "" || !rel.startsWith(prefix)) continue;
    const item = new vscode.CompletionItem(rel, vscode.CompletionItemKind.File);
    item.detail = "table";
    out.push(item);
    if (out.length >= MAX_COMPLETIONS) break;
  }
  return out;
}

function toItem(value: string, entry: IndexEntry, folder: string): vscode.CompletionItem {
  const kind =
    entry.kind === "component"
      ? vscode.CompletionItemKind.Property
      : entry.kind === "geometry"
        ? vscode.CompletionItemKind.Constant
        : entry.kind === "variable"
          ? vscode.CompletionItemKind.Variable
          : vscode.CompletionItemKind.Value;
  const item = new vscode.CompletionItem(value, kind);
  const rel = entry.file.fsPath.startsWith(folder)
    ? entry.file.fsPath.slice(folder.length + 1)
    : entry.file.fsPath;
  item.detail = `${entry.kind} · ${rel}`;
  return item;
}

async function molangItems(
  context: vscode.ExtensionContext,
  molang: { scope: "query" | "math" | "variable"; stem: string },
  folder: string,
): Promise<vscode.CompletionItem[]> {
  const out: vscode.CompletionItem[] = [];
  if (molang.scope === "variable") {
    for (const [value, entry] of entries) {
      if (entry.kind !== "variable" || !value.startsWith(molang.stem)) continue;
      out.push(toItem(value, entry, folder));
      if (out.length >= MAX_COMPLETIONS) break;
    }
    return out;
  }
  const data = await loadMolang(context);
  if (!data) return out;
  for (const entry of data.values()) {
    if (!entry.label.startsWith(`${molang.scope}.`) || !entry.label.startsWith(molang.stem)) {
      continue;
    }
    const item = new vscode.CompletionItem(entry.label, vscode.CompletionItemKind.Function);
    item.detail = entry.detail;
    out.push(item);
    if (out.length >= MAX_COMPLETIONS) break;
  }
  return out;
}

export function registerCompletion(context: vscode.ExtensionContext): void {
  const provider: vscode.CompletionItemProvider = {
    async provideCompletionItems(document, position) {
      const prefix = prefixAt(document, position);
      if (prefix === undefined) return undefined;
      if (!built || dirty) await buildIndex();
      if (!inRoots(document.uri.fsPath)) return undefined;
      const folder = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath ?? "";
      const molang = molangScope(prefix);
      if (molang) return molangItems(context, molang, folder);
      const tablePrefix = tablePrefixAt(document, position);
      if (tablePrefix !== undefined) return tableItems(document, tablePrefix);
      const out: vscode.CompletionItem[] = [];
      for (const [value, entry] of entries) {
        if (!value.startsWith(prefix)) continue;
        out.push(toItem(value, entry, folder));
        if (out.length >= MAX_COMPLETIONS) break;
      }
      return out;
    },
  };
  for (const language of ["json", "jsonc"]) {
    context.subscriptions.push(
      vscode.languages.registerCompletionItemProvider(
        { language, scheme: "file" },
        provider,
        '"',
        ".",
        ":",
        "/",
      ),
    );
  }
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => markCompletionsDirty(document)),
  );
}
