import * as vscode from "vscode";

import { resolveProject } from "./config.js";
import {
  FILE_REF_EXTS,
  GEOMETRY_NAME,
  IDENTIFIER_VALUE,
  MAX_HITS,
  MAX_INDEX_FILES,
  MAX_REFERENCES,
  MAX_SCAN_BYTES,
} from "./constants.js";

export interface IndexHit {
  file: vscode.Uri;
  line: number;
  kind: string;
}

const SEARCHERS: {
  kind: string;
  pattern: (id: string) => RegExp;
  first?: (id: string) => RegExp;
}[] = [
  {
    kind: "identifier",
    pattern: (id) => new RegExp(`"identifier"\\s*:\\s*"${escapeRe(id)}"`, "g"),
  },
  {
    kind: "reference",
    pattern: (id) => new RegExp(`"${escapeRe(id)}"`, "g"),
  },
  {
    kind: "geometry",
    pattern: (id) => new RegExp(`"${escapeRe(id)}"`, "g"),
  },
  {
    kind: "variable",
    pattern: (id) => new RegExp(variableAlternatives(id), "g"),
  },
  {
    // event and component group blocks share one shape; definitions sort before usages.
    kind: "event",
    pattern: (id) =>
      new RegExp(`"event"\\s*:\\s*"${escapeRe(id)}"|"${escapeRe(id)}"\\s*:\\s*\\{`, "g"),
    first: (id) => new RegExp(`"${escapeRe(id)}"\\s*:\\s*\\{`, "g"),
  },
  {
    // recipe and loot item values; definitions land before usages.
    kind: "item",
    pattern: (id) =>
      new RegExp(
        `"identifier"\\s*:\\s*"${escapeRe(id)}"|"item"\\s*:\\s*"${escapeRe(id)}"|"name"\\s*:\\s*"${escapeRe(id)}"`,
        "g",
      ),
    first: (id) => new RegExp(`"identifier"\\s*:\\s*"${escapeRe(id)}"`, "g"),
  },
  {
    kind: "file",
    pattern: (id) => new RegExp(escapeRe(id), "g"),
  },
];

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// molang prefix groups: v=variable, t=temp, c=context.
function variableAlternatives(word: string): string {
  const dot = word.indexOf(".");
  const head = dot === -1 ? word : word.slice(0, dot);
  const tail = dot === -1 ? "" : word.slice(dot + 1);
  const group =
    head === "variable" || head === "v"
      ? "(?:variable|v)"
      : head === "temp" || head === "t"
        ? "(?:temp|t)"
        : head === "context" || head === "c"
          ? "(?:context|c)"
          : escapeRe(head);
  return `${group}\\.${escapeRe(tail)}`;
}

// assignment sites: variable.foo = ..., excluding ==, !=, >=, <=.
function variableAssignment(word: string): RegExp {
  return new RegExp(`(?:^|[^=!<>\\w.])(${variableAlternatives(word)})\\s*=(?![=>])`, "g");
}

// event and component group names: "event": "id", "id": {...}, or ids on
// component_groups lines. checked before identifiers.
function eventAt(line: string, cursor: number): { text: string; kind: string } | null {
  const at = (index: number, length: number): boolean =>
    cursor >= index && cursor <= index + length;
  for (const hit of line.matchAll(/"event"\s*:\s*"([^"]+)"/g)) {
    const text = hit[1]!;
    const start = (hit.index ?? -1) + hit[0]!.indexOf(text);
    if (at(start, text.length)) return { text, kind: "event" };
  }
  const idShape = "[A-Za-z0-9_.-]+:[A-Za-z0-9_./-]+";
  for (const hit of line.matchAll(new RegExp(`"(${idShape})"\\s*:\\s*\\{`, "g"))) {
    const text = hit[1]!;
    const start = (hit.index ?? -1) + 1;
    if (at(start, text.length)) return { text, kind: "event" };
  }
  if (line.includes('"component_groups"')) {
    for (const hit of line.matchAll(new RegExp(`"(${idShape})"`, "g"))) {
      const text = hit[1]!;
      if (text.startsWith("minecraft:")) continue;
      const start = (hit.index ?? -1) + 1;
      const before = line.slice(0, hit.index ?? 0);
      if (/"identifier"\s*:\s*$/.test(before)) continue;
      if (at(start, text.length)) return { text, kind: "event" };
    }
  }
  return null;
}

// recipe ingredient and result values: "item": "id" shapes. checked before identifiers.
function itemAt(line: string, cursor: number): { text: string; kind: string } | null {
  for (const hit of line.matchAll(/"item"\s*:\s*"([^"]+)"/g)) {
    const text = hit[1]!;
    const start = (hit.index ?? -1) + hit[0]!.indexOf(text);
    if (cursor >= start && cursor <= start + text.length) return { text, kind: "item" };
  }
  return null;
}

// loot entry targets: "name": "loot_tables/..." shapes. paths carry a slash and no colon.
function lootEntryAt(line: string, cursor: number): { text: string; kind: string } | null {
  for (const hit of line.matchAll(/"name"\s*:\s*"([^"]+)"/g)) {
    const text = hit[1]!;
    if (!text.includes("/") || text.includes(":")) continue;
    const start = (hit.index ?? -1) + hit[0]!.indexOf(text);
    if (cursor >= start && cursor <= start + text.length) return { text, kind: "table" };
  }
  return null;
}

// current word: identifier, recipe item, geometry/controller/animation name, file ref,
// molang var, or event/component group. null on plain text.
export function wordAt(
  document: vscode.TextDocument,
  position: vscode.Position,
): { text: string; kind: string } | null {
  const line = document.lineAt(position.line).text;
  const event = eventAt(line, position.character);
  if (event) return event;
  const item = itemAt(line, position.character);
  if (item) return item;
  const lootEntry = lootEntryAt(line, position.character);
  if (lootEntry) return lootEntry;
  const idRe = new RegExp(`"(${IDENTIFIER_VALUE})"`, "g");
  const geoRe = new RegExp(`"(${GEOMETRY_NAME})"`, "g");
  const fileRe = new RegExp(`"([\\w./-]*(${FILE_REF_EXTS.map(escapeRe).join("|")}))"`, "g");
  const varRe = /"((?:variable|v|t|c|temp|context|array)\.[\w.]+)"/g;
  const tableRe = /"table"\s*:\s*"([^"]+)"/g;
  for (const { re, kind } of [
    { re: idRe, kind: "identifier" },
    { re: geoRe, kind: "geometry" },
    { re: fileRe, kind: "file" },
    { re: varRe, kind: "variable" },
    { re: tableRe, kind: "table" },
  ] as const) {
    for (const hit of line.matchAll(re)) {
      const text = hit[1]!;
      const start = (hit.index ?? -1) + hit[0]!.indexOf(text);
      const end = start + text.length;
      const cursor = position.character;
      if (cursor >= start && cursor <= end) return { text, kind };
    }
  }
  return null;
}

export async function findDefinition(
  target: { text: string; kind: string },
  doc: vscode.TextDocument,
  limit: number = MAX_HITS,
): Promise<IndexHit[]> {
  const hits: IndexHit[] = [];
  if (target.kind === "file") {
    const found = await resolveFileRef(doc, target.text);
    if (found) hits.push({ file: found, line: 0, kind: "file" });
  }
  if (target.kind === "table") {
    const found = await resolveTableRef(doc, target.text);
    if (found) hits.push({ file: found, line: 0, kind: "table" });
  }
  const searcher = SEARCHERS.find((entry) => entry.kind === target.kind) ?? SEARCHERS[1]!;
  const files = await packJsonFiles(doc);
  // variable definitions land first, then usages; other kinds keep scan order.
  const patterns =
    target.kind === "variable"
      ? [variableAssignment(target.text), searcher.pattern(target.text)]
      : searcher.first
        ? [searcher.first(target.text), searcher.pattern(target.text)]
        : [searcher.pattern(target.text)];
  // v.foo and variable.foo are one variable; probe the short name and let patterns decide.
  const probe =
    target.kind === "variable" ? target.text.slice(target.text.indexOf(".") + 1) : target.text;
  const seen = new Set<string>();
  for (const re of patterns) {
    for (const file of files.slice(0, MAX_INDEX_FILES)) {
      const text = await readCapped(file);
      if (text === undefined) continue;
      if (!text.includes(probe)) continue;
      re.lastIndex = 0;
      for (const hit of text.matchAll(re)) {
        const line = lineOf(text, hit.index ?? 0);
        const key = `${file.fsPath}:${line}`;
        if (seen.has(key)) continue;
        seen.add(key);
        hits.push({ file, line, kind: searcher.kind });
        if (hits.length >= limit) return hits;
      }
      if (hits.length >= limit) break;
    }
    if (hits.length >= limit) break;
  }
  return hits;
}

// every occurrence of an identifier; same scan as definitions with a higher cap.
export async function findReferences(
  target: { text: string; kind: string },
  doc: vscode.TextDocument,
): Promise<IndexHit[]> {
  return findDefinition(target, doc, MAX_REFERENCES);
}

export async function packJsonFiles(doc?: vscode.TextDocument): Promise<vscode.Uri[]> {
  try {
    const project = await resolveProject();
    const bp = new vscode.RelativePattern(project.config.packs.bp, "**/*.json");
    const rp = new vscode.RelativePattern(project.config.packs.rp, "**/*.json");
    const [bpFiles, rpFiles] = await Promise.all([
      vscode.workspace.findFiles(bp, "**/node_modules/**", MAX_INDEX_FILES),
      vscode.workspace.findFiles(rp, "**/node_modules/**", MAX_INDEX_FILES),
    ]);
    const both = [...bpFiles, ...rpFiles];
    if (both.length > 0) return both;
  } catch {}
  const folder = doc
    ? vscode.workspace.getWorkspaceFolder(doc.uri)
    : vscode.workspace.workspaceFolders?.[0];
  const base = folder ? new vscode.RelativePattern(folder, "packs/**/*.json") : "packs/**/*.json";
  return vscode.workspace.findFiles(base, "**/node_modules/**", MAX_INDEX_FILES);
}

export async function readCapped(file: vscode.Uri): Promise<string | undefined> {
  try {
    const raw = await vscode.workspace.fs.readFile(file);
    if (raw.length > MAX_SCAN_BYTES) return undefined;
    return Buffer.from(raw).toString("utf8");
  } catch {
    return undefined;
  }
}

function lineOf(text: string, index: number): number {
  let line = 0;
  for (let at = 0; at < index; at++) if (text[at] === "\n") line++;
  return line;
}

async function resolveFileRef(
  doc: vscode.TextDocument,
  ref: string,
): Promise<vscode.Uri | undefined> {
  const folder = vscode.workspace.getWorkspaceFolder(doc.uri);
  if (!folder) return undefined;
  const clean = ref.replace(/^\.\//, "");
  const candidates = [
    vscode.Uri.joinPath(folder.uri, clean),
    vscode.Uri.joinPath(folder.uri, "packs/BP", clean),
    vscode.Uri.joinPath(folder.uri, "packs/RP", clean),
  ];
  try {
    const project = await resolveProject();
    candidates.unshift(
      vscode.Uri.joinPath(vscode.Uri.file(project.config.packs.bp), clean),
      vscode.Uri.joinPath(vscode.Uri.file(project.config.packs.rp), clean),
    );
  } catch {}
  for (const candidate of candidates) {
    try {
      await vscode.workspace.fs.stat(candidate);
      return candidate;
    } catch {}
  }
  return undefined;
}

// loot and trade table paths live under BP without an extension; try the raw
// path, then with .json appended.
export async function resolveTableRef(
  doc: vscode.TextDocument,
  ref: string,
): Promise<vscode.Uri | undefined> {
  if (ref === "" || ref.includes("..")) return undefined;
  const folder = vscode.workspace.getWorkspaceFolder(doc.uri);
  const roots: vscode.Uri[] = [];
  try {
    roots.push(vscode.Uri.file((await resolveProject()).config.packs.bp));
  } catch {}
  if (folder) roots.push(vscode.Uri.joinPath(folder.uri, "packs", "BP"));
  for (const root of roots) {
    for (const candidate of [
      vscode.Uri.joinPath(root, ref),
      vscode.Uri.joinPath(root, `${ref}.json`),
    ]) {
      try {
        await vscode.workspace.fs.stat(candidate);
        return candidate;
      } catch {}
    }
  }
  return undefined;
}

// table hover: null off target, on dynamic paths, or when the file is missing.
export async function tableHover(
  document: vscode.TextDocument,
  position: vscode.Position,
): Promise<{ path: string; pools: number; entries: number } | null> {
  const target = wordAt(document, position);
  if (!target || target.kind !== "table") return null;
  if (target.text.includes("$") || target.text.includes("{{")) return null;
  const found = await resolveTableRef(document, target.text);
  if (!found) return null;
  const text = await readCapped(found);
  if (text === undefined) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const pools = (parsed as { pools?: unknown }).pools;
  if (!Array.isArray(pools)) return { path: target.text, pools: 0, entries: 0 };
  let entries = 0;
  for (const pool of pools) {
    const list = (pool as { entries?: unknown } | null)?.entries;
    if (Array.isArray(list)) entries += list.length;
  }
  return { path: target.text, pools: pools.length, entries };
}

export function registerTableHover(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      [
        { language: "json", scheme: "file" },
        { language: "jsonc", scheme: "file" },
      ],
      {
        async provideHover(document, position) {
          const info = await tableHover(document, position);
          if (!info) return undefined;
          const poolWord = info.pools === 1 ? "pool" : "pools";
          const entryWord = info.entries === 1 ? "entry" : "entries";
          return new vscode.Hover([
            `$(symbol-file) ${info.path}`,
            `${info.pools} ${poolWord}, ${info.entries} ${entryWord}`,
          ]);
        },
      },
    ),
  );
}

export async function searchItemDefinition(
  document: vscode.TextDocument,
  id: string,
): Promise<vscode.Uri | undefined> {
  const re = new RegExp(`"identifier"\\s*:\\s*"${escapeRe(id)}"`);
  for (const file of (await packJsonFiles(document)).slice(0, MAX_INDEX_FILES)) {
    const text = await readCapped(file);
    if (!text || !text.includes(id)) continue;
    re.lastIndex = 0;
    if (re.test(text)) return file;
  }
  return undefined;
}

function displayPath(document: vscode.TextDocument, file: vscode.Uri): string {
  const base = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath;
  if (base && file.fsPath.startsWith(base)) {
    return file.fsPath.slice(base.length).replace(/^[/\\]/, "");
  }
  return file.fsPath.split(/[\\/]/).pop() ?? file.fsPath;
}

// item hover: null off target or on dynamic paths. missing files still report, so
// vanilla ids read as vanilla.
export async function itemHover(
  document: vscode.TextDocument,
  position: vscode.Position,
): Promise<{ id: string; file: string | null; vanilla: boolean } | null> {
  const target = wordAt(document, position);
  if (!target || target.kind !== "item") return null;
  if (target.text.includes("$") || target.text.includes("{{")) return null;
  const found = await searchItemDefinition(document, target.text);
  if (found) return { id: target.text, file: displayPath(document, found), vanilla: false };
  return { id: target.text, file: null, vanilla: target.text.startsWith("minecraft:") };
}

export function registerItemHover(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      [
        { language: "json", scheme: "file" },
        { language: "jsonc", scheme: "file" },
      ],
      {
        async provideHover(document, position) {
          const info = await itemHover(document, position);
          if (!info) return undefined;
          if (info.file)
            return new vscode.Hover([`$(symbol-file) ${info.id}`, `Defined in ${info.file}`]);
          if (info.vanilla) {
            return new vscode.Hover([
              `$(symbol-file) ${info.id}`,
              "Vanilla item, no pack file expected",
            ]);
          }
          return new vscode.Hover([`$(symbol-file) ${info.id}`, "No item definition in this pack"]);
        },
      },
    ),
  );
}
