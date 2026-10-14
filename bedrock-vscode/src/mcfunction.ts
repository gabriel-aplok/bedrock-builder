import * as vscode from "vscode";

import {
  COMMAND_FORMS_PREFIX,
  MAX_COMPLETIONS,
  PACKAGE_PREFIX,
  SETTING_SCHEMA_VERSION,
} from "./constants.js";
import { resolveProject } from "./config.js";
import { findDefinition } from "./goto.js";
import { fetchRegistry, resolveVersion } from "./schemaVersion.js";
import { parseJsonc } from "@aplok/bedrock-builder/editor";

export interface CommandField {
  title: string;
  description: string;
  optional: boolean;
  commandType?: string | undefined;
}

export interface CommandForm {
  name: string;
  description: string;
  fields: CommandField[];
}

export interface TypeForm {
  hint?: string | undefined;
  samples: { label: string; detail?: string | undefined }[];
}

export interface CommandDataset {
  commands: Map<string, CommandForm>;
  types: Map<string, TypeForm>;
}

export interface ProjectValues {
  entities: string[];
  items: string[];
  functions: string[];
}

export interface SuggestItem {
  label: string;
  detail: string;
  kind: "command" | "field" | "value" | "selector";
}

// forms carry a .form.json suffix in the store, catalog style ids
export function parseForms(files: { name: string; text: string }[]): CommandDataset {
  const commands = new Map<string, CommandForm>();
  const types = new Map<string, TypeForm>();
  for (const file of files) {
    let doc: unknown;
    try {
      doc = JSON.parse(file.text);
    } catch {
      continue;
    }
    if (typeof doc !== "object" || doc === null) continue;
    const record = doc as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : "";
    if (id.startsWith("cmd_") && typeof record.title === "string") {
      const fields: CommandField[] = [];
      if (Array.isArray(record.fields)) {
        for (const entry of record.fields) {
          if (typeof entry !== "object" || entry === null) continue;
          const row = entry as Record<string, unknown>;
          if (typeof row.title !== "string") continue;
          fields.push({
            title: row.title,
            description: typeof row.description === "string" ? row.description : "",
            optional: row.isOptional === true,
            commandType: typeof row.commandType === "string" ? row.commandType : undefined,
          });
        }
      }
      commands.set(record.title, {
        name: record.title,
        description: typeof record.description === "string" ? record.description : "",
        fields,
      });
    } else if (id.startsWith("type_")) {
      const samples: TypeForm["samples"] = [];
      const raw = (record.samples as Record<string, unknown> | undefined)?.values;
      if (Array.isArray(raw)) {
        for (const sample of raw) {
          if (typeof sample !== "object" || sample === null) continue;
          const content = (sample as Record<string, unknown>).content;
          const path = (sample as Record<string, unknown>).path;
          if (typeof content === "string" && content !== "") {
            samples.push({
              label: content,
              detail: typeof path === "string" ? path : undefined,
            });
          }
        }
      }
      types.set(id, {
        hint: typeof record.formatHint === "string" ? record.formatHint : undefined,
        samples,
      });
    }
  }
  return { commands, types };
}

export interface Token {
  text: string;
  start: number;
}

// split on spaces, keep quoted spans whole, quotes included
export function tokenize(line: string): Token[] {
  const out: Token[] = [];
  let current = "";
  let start = -1;
  let quoted: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (quoted !== null) {
      current += char;
      if (char === quoted) quoted = null;
      continue;
    }
    if (char === '"' || char === "'") {
      if (start === -1) start = i;
      quoted = char;
      current += char;
      continue;
    }
    if (char === " " || char === "\t") {
      if (start !== -1) {
        out.push({ text: current, start });
        current = "";
        start = -1;
      }
      continue;
    }
    if (start === -1) start = i;
    current += char;
  }
  if (start !== -1) out.push({ text: current, start });
  return out;
}

const SELECTORS: { name: string; detail: string }[] = [
  { name: "@a", detail: "all players" },
  { name: "@e", detail: "all entities" },
  { name: "@p", detail: "nearest player" },
  { name: "@r", detail: "random player" },
  { name: "@s", detail: "executing entity" },
  { name: "@c", detail: "executing agent" },
  { name: "@v", detail: "all agents" },
  { name: "@initiator", detail: "interacting entity" },
];

const SELECTOR_ARGS: { name: string; detail: string }[] = [
  { name: "type", detail: "entity identifier" },
  { name: "name", detail: "display name" },
  { name: "tag", detail: "scoreboard tag" },
  { name: "family", detail: "entity family" },
  { name: "gamemode", detail: "survival, creative, adventure, spectator" },
  { name: "level", detail: "experience level" },
  { name: "x", detail: "center x" },
  { name: "y", detail: "center y" },
  { name: "z", detail: "center z" },
  { name: "dx", detail: "x volume" },
  { name: "dy", detail: "y volume" },
  { name: "dz", detail: "z volume" },
  { name: "r", detail: "max radius" },
  { name: "rm", detail: "min radius" },
  { name: "rx", detail: "max x rotation" },
  { name: "rxm", detail: "min x rotation" },
  { name: "ry", detail: "max y rotation" },
  { name: "rym", detail: "min y rotation" },
  { name: "c", detail: "result count" },
  { name: "scores", detail: "scoreboard objectives" },
  { name: "hasitem", detail: "inventory filter" },
  { name: "hasproperty", detail: "entity property filter" },
];

const SELECTOR_TYPES = new Set(["SELECTION", "TARGET_ENTITY", "EVENTENTITYACTION"]);
// subcommand chains cannot map onto the flat field list; only unknown-command check applies.
const FLAT_SKIP = new Set(["execute"]);
const ENTITY_TYPES = new Set(["ENTITYTYPE", "ENTITY_TYPE"]);
const ITEM_TYPES = new Set(["ITEM", "ITEMNAME"]);
const FUNCTION_TYPES = new Set(["PATHCOMMAND"]);

// suggest values for one line; tokens are the prior words, prefix is the word under the cursor.
export function suggestCommand(
  tokens: string[],
  activeIndex: number,
  prefix: string,
  data: CommandDataset,
  project: ProjectValues,
): SuggestItem[] {
  if (activeIndex <= 0) {
    return [...data.commands.values()]
      .filter((command) => command.name.startsWith(prefix))
      .map((command) => ({
        label: command.name,
        detail: command.description,
        kind: "command" as const,
      }));
  }
  const command = data.commands.get(tokens[0]!);
  if (!command || command.fields.length === 0) return [];
  const field = command.fields[Math.min(activeIndex - 1, command.fields.length - 1)]!;
  const token = tokens[activeIndex] ?? "";
  const bracket = selectorBracket(token);
  if (bracket) return suggestSelector(bracket, project);
  const values = fieldValues(field, data, project);
  const kept = values.filter((item) => item.label.startsWith(prefix));
  if (kept.length > 0) return kept.slice(0, MAX_COMPLETIONS);
  const hint = field.description !== "" ? field.description : field.title;
  return [{ label: prefix, detail: hint, kind: "field" }];
}

// split a selector token after the last [ or =; null when not an open selector.
function selectorBracket(token: string): { afterEquals: boolean; prefix: string } | null {
  const open = token.lastIndexOf("[");
  if (open === -1 || token.slice(open).includes("]")) return null;
  const rest = token.slice(open + 1);
  const equals = rest.lastIndexOf("=");
  const comma = rest.lastIndexOf(",");
  if (equals > comma) return { afterEquals: true, prefix: rest.slice(equals + 1) };
  return { afterEquals: false, prefix: rest.slice(comma + 1) };
}

function suggestSelector(
  bracket: { afterEquals: boolean; prefix: string },
  project: ProjectValues,
): SuggestItem[] {
  if (bracket.afterEquals) {
    return project.entities
      .filter((id) => id.startsWith(bracket.prefix))
      .map((id) => ({ label: id, detail: "project entity", kind: "value" as const }))
      .slice(0, MAX_COMPLETIONS);
  }
  return SELECTOR_ARGS.filter((arg) => arg.name.startsWith(bracket.prefix)).map((arg) => ({
    label: `${arg.name}=`,
    detail: arg.detail,
    kind: "selector" as const,
  }));
}

function fieldValues(
  field: CommandField,
  data: CommandDataset,
  project: ProjectValues,
): SuggestItem[] {
  const type = field.commandType;
  if (type === undefined) return [];
  if (SELECTOR_TYPES.has(type)) {
    return SELECTORS.map((row) => ({
      label: row.name,
      detail: row.detail,
      kind: "selector" as const,
    }));
  }
  if (ENTITY_TYPES.has(type)) {
    return project.entities.map((id) => ({
      label: id,
      detail: "project entity",
      kind: "value" as const,
    }));
  }
  if (ITEM_TYPES.has(type)) {
    return project.items.map((id) => ({
      label: id,
      detail: "project item",
      kind: "value" as const,
    }));
  }
  if (FUNCTION_TYPES.has(type)) {
    return project.functions.map((name) => ({
      label: name,
      detail: "project function",
      kind: "value" as const,
    }));
  }
  const form = data.types.get(`type_${type.toLowerCase()}`);
  if (!form) return [];
  return form.samples.map((sample) => ({
    label: sample.label,
    detail: sample.detail ?? field.title,
    kind: "value" as const,
  }));
}

// store path drops the package/ prefix, so forms land in forms/command/
function formsSubdir(): string[] {
  return COMMAND_FORMS_PREFIX.slice(PACKAGE_PREFIX.length)
    .split("/")
    .filter((part) => part !== "");
}

interface LoadedData {
  version: string;
  data: CommandDataset;
}

// hover text for the token under the cursor; position 0 is the command.
export function hoverAt(
  tokens: string[],
  activeIndex: number,
  data: CommandDataset,
): { title: string; body: string } | null {
  if (tokens.length === 0 || activeIndex < 0 || activeIndex >= tokens.length) return null;
  const command = data.commands.get(tokens[0]!);
  if (!command) return null;
  if (activeIndex === 0) {
    return { title: command.name, body: command.description };
  }
  if (command.fields.length === 0) return null;
  const field = command.fields[Math.min(activeIndex - 1, command.fields.length - 1)]!;
  const type = field.commandType ? ` (${field.commandType.toLowerCase()})` : "";
  const optional = field.optional ? ", optional" : "";
  return {
    title: `${command.name} ${field.title}`,
    body: `${field.description}${type}${optional}`,
  };
}

let loaded: LoadedData | undefined;

async function readForms(
  context: vscode.ExtensionContext,
  version: string,
): Promise<{ name: string; text: string }[]> {
  const dir = vscode.Uri.joinPath(
    context.globalStorageUri,
    "minecraft",
    version,
    "bedrock-schemas",
  );
  const out: { name: string; text: string }[] = [];
  const subdir = formsSubdir();
  let entries: [string, vscode.FileType][];
  try {
    entries = await vscode.workspace.fs.readDirectory(vscode.Uri.joinPath(dir, ...subdir));
  } catch {
    return out;
  }
  for (const [name] of entries) {
    if (!name.endsWith(".form.json")) continue;
    try {
      const raw = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(dir, ...subdir, name));
      out.push({ name, text: Buffer.from(raw).toString("utf8") });
    } catch {}
  }
  return out;
}

// resolved schema version for the store dir, shared by command and molang loaders.
export async function storeVersion(): Promise<string | undefined> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  const wanted = folder
    ? vscode.workspace
        .getConfiguration(undefined, folder.uri)
        .get<string>(SETTING_SCHEMA_VERSION, "latest")
    : "latest";
  try {
    return resolveVersion(wanted, await fetchRegistry());
  } catch {
    return undefined;
  }
}

async function loadDataset(context: vscode.ExtensionContext): Promise<CommandDataset | undefined> {
  const version = await storeVersion();
  if (!version) return loaded?.data;
  if (loaded && loaded.version === version) return loaded.data;
  const data = parseForms(await readForms(context, version));
  if (data.commands.size === 0) return loaded?.data;
  loaded = { version, data };
  return data;
}

async function projectValues(document: vscode.TextDocument): Promise<ProjectValues> {
  const values: ProjectValues = { entities: [], items: [], functions: [] };
  let bp: string | undefined;
  try {
    bp = (await resolveProject()).config.packs.bp;
  } catch {
    bp = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath;
  }
  if (!bp) return values;
  const base = vscode.Uri.file(bp);
  const [entityFiles, itemFiles, functionFiles] = await Promise.all([
    vscode.workspace.findFiles(new vscode.RelativePattern(base, "entities/**/*.json"), null, 500),
    vscode.workspace.findFiles(new vscode.RelativePattern(base, "items/**/*.json"), null, 500),
    vscode.workspace.findFiles(
      new vscode.RelativePattern(base, "functions/**/*.mcfunction"),
      null,
      500,
    ),
  ]);
  const ids = async (files: vscode.Uri[]): Promise<string[]> => {
    const out: string[] = [];
    for (const file of files) {
      try {
        const raw = await vscode.workspace.fs.readFile(file);
        const doc: unknown = parseJsonc(Buffer.from(raw).toString("utf8"));
        if (typeof doc !== "object" || doc === null) continue;
        for (const body of Object.values(doc as Record<string, unknown>)) {
          if (typeof body !== "object" || body === null) continue;
          const desc = (body as Record<string, unknown>).description;
          if (typeof desc !== "object" || desc === null) continue;
          const id = (desc as Record<string, unknown>).identifier;
          if (typeof id === "string" && id !== "" && !out.includes(id)) out.push(id);
        }
      } catch {}
    }
    return out;
  };
  values.entities = await ids(entityFiles);
  values.items = await ids(itemFiles);
  for (const file of functionFiles) {
    const rel = file.fsPath.replace(/\\/g, "/");
    const at = rel.lastIndexOf("/functions/");
    if (at === -1) continue;
    values.functions.push(rel.slice(at + "/functions/".length).replace(/\.mcfunction$/, ""));
  }
  return values;
}

function toItem(item: SuggestItem): vscode.CompletionItem {
  const kind =
    item.kind === "command"
      ? vscode.CompletionItemKind.Keyword
      : item.kind === "field"
        ? vscode.CompletionItemKind.Interface
        : item.kind === "selector"
          ? vscode.CompletionItemKind.Variable
          : vscode.CompletionItemKind.Value;
  const completion = new vscode.CompletionItem(item.label, kind);
  completion.detail = item.detail;
  return completion;
}

export function registerMcfunctionCompletion(context: vscode.ExtensionContext): void {
  const provider: vscode.CompletionItemProvider = {
    async provideCompletionItems(document, position) {
      const line = document.lineAt(position.line).text.slice(0, position.character);
      if (line.trimStart().startsWith("#")) return undefined;
      const data = await loadDataset(context);
      if (!data) return undefined;
      const tokens = tokenize(line);
      let activeIndex = tokens.length;
      let prefix = "";
      if (tokens.length > 0) {
        const last = tokens[tokens.length - 1]!;
        if (position.character <= last.start + last.text.length) {
          activeIndex = tokens.length - 1;
          prefix = last.text.slice(0, position.character - last.start);
        }
      }
      const words = tokens.map((token) => token.text);
      if (activeIndex < words.length) words[activeIndex] = prefix;
      else words.push(prefix);
      const project = await projectValues(document);
      return suggestCommand(words, activeIndex, prefix, data, project).map(toItem);
    },
  };
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      { language: "mcfunction", scheme: "file" },
      provider,
      " ",
      "@",
      "[",
      "=",
      ",",
      ":",
    ),
  );
}

// path after the function command, without quotes or slashes abuse. null unless on the path argument.
export function functionPathOf(tokens: string[], activeIndex: number): string | null {
  if (tokens[0] !== "function" || activeIndex !== 1) return null;
  const raw = (tokens[1] ?? "").replace(/^["']|["']$/g, "");
  if (raw === "" || raw.includes("..")) return null;
  return raw;
}

export function registerMcfunctionHover(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { language: "mcfunction", scheme: "file" },
      {
        async provideHover(document, position) {
          const line = document.lineAt(position.line).text;
          if (line.trimStart().startsWith("#")) return undefined;
          const data = await loadDataset(context);
          if (!data) return undefined;
          const tokens = tokenize(line.slice(0, position.character));
          if (tokens.length === 0) return undefined;
          const last = tokens[tokens.length - 1]!;
          if (position.character > last.start + last.text.length) return undefined;
          const hit = hoverAt(
            tokens.map((token) => token.text),
            tokens.length - 1,
            data,
          );
          if (!hit || hit.body === "") return undefined;
          return new vscode.Hover([`$(symbol-function) ${hit.title}`, hit.body]);
        },
      },
    ),
  );
}

// token widths per argument type. positions take three words, trailing message types take the rest.
function fieldSpan(type: string | undefined): number {
  if (type === "POSITION" || type === "POSITION_FLOAT") return 3;
  if (
    type === "MESSAGE_ROOT" ||
    type === "MESSAGE" ||
    type === "RAWTEXT" ||
    type === "JSON_OBJECT"
  ) {
    return Number.POSITIVE_INFINITY;
  }
  return 1;
}

const INT_PATTERN = /^-?\d+$/;
const NUM_PATTERN = /^-?\d+(\.\d+)?$/;
const COORD_PATTERN = /^[~^]?-?\d*(\.\d+)?$/;
const SELECTOR_PATTERN = /^@([a-z]+)(\[.*)?$/;

const VALID_SELECTORS = new Set(["a", "e", "p", "r", "s", "c", "v", "initiator"]);

const SKIP_TYPES = new Set([
  "MESSAGE_ROOT",
  "MESSAGE",
  "RAWTEXT",
  "JSON_OBJECT",
  "TAGVALUES",
  "ID",
  "ENTITYEVENTS",
]);

export interface LineDiagnostic {
  message: string;
  severity: "error" | "warning";
  start: number;
  end: number;
  // quick fix routing: replace offers values, remove drops surplus args, create makes the file.
  fix?: "replace" | "remove" | "create" | undefined;
}

// scan one command line and report errors and warnings.
export function diagnoseLine(
  tokens: Token[],
  data: CommandDataset,
  project: ProjectValues,
): LineDiagnostic[] {
  const out: LineDiagnostic[] = [];
  if (tokens.length === 0) return out;
  const first = tokens[0]!;
  const command = data.commands.get(first.text);
  if (!command) {
    return [
      {
        message: `unknown command "${first.text}"`,
        severity: "error",
        start: first.start,
        end: first.start + first.text.length,
      },
    ];
  }
  const args = tokens.slice(1);
  if (FLAT_SKIP.has(command.name)) return out;
  if (args.length === 0) {
    const missing = command.fields.find((field) => !field.optional);
    if (missing) {
      out.push({
        message: `missing ${missing.title}`,
        severity: "warning",
        start: first.start,
        end: first.start + first.text.length,
      });
    }
    return out;
  }
  let at = 0;
  for (const field of command.fields) {
    // @ tokens may target a sibling overload; never burn a slot unless the field takes selectors.
    const takesSelector = field.commandType !== undefined && SELECTOR_TYPES.has(field.commandType);
    while (!takesSelector && at < args.length && args[at]!.text.startsWith("@")) at++;
    const span = fieldSpan(field.commandType);
    const slice = args.slice(at, span === Number.POSITIVE_INFINITY ? undefined : at + span);
    if (slice.length === 0) break;
    for (const token of slice) {
      const hit = checkToken(token, field, data, project);
      if (hit) out.push(hit);
    }
    at += slice.length;
    if (span === Number.POSITIVE_INFINITY) break;
  }
  if (at < args.length) {
    const extra = args[at]!;
    out.push({
      message: `too many arguments for "${command.name}"`,
      severity: "error",
      start: extra.start,
      end: extra.start + extra.text.length,
      fix: "remove",
    });
  }
  return out;
}

function knownCustomId(id: string, known: string[]): boolean {
  if (id.startsWith("minecraft:")) return true;
  if (!id.includes(":")) return true;
  return known.includes(id);
}

function checkToken(
  token: Token,
  field: CommandField,
  data: CommandDataset,
  project: ProjectValues,
): LineDiagnostic | null {
  const start = token.start;
  const end = token.start + token.text.length;
  const fail = (message: string, fix: LineDiagnostic["fix"] = "replace"): LineDiagnostic => ({
    message,
    severity: "error",
    start,
    end,
    fix,
  });
  const warn = (message: string, fix: LineDiagnostic["fix"] = "replace"): LineDiagnostic => ({
    message,
    severity: "warning",
    start,
    end,
    fix,
  });
  const type = field.commandType;
  if (type === undefined || SKIP_TYPES.has(type)) return null;
  if (SELECTOR_TYPES.has(type)) {
    if (!token.text.startsWith("@")) return null;
    const hit = SELECTOR_PATTERN.exec(token.text);
    if (!hit || !VALID_SELECTORS.has(hit[1]!)) {
      return fail(`unknown selector "${token.text}"`);
    }
    if (hit[2] !== undefined && !hit[2].endsWith("]")) {
      return fail(`unclosed selector "${token.text}"`);
    }
    const entityType = /[[,]type=([^,\]]+)/.exec(token.text);
    if (entityType) {
      const id = entityType[1]!.replace(/^!/, "");
      if (!knownCustomId(id, project.entities)) return warn(`unknown entity "${id}"`);
    }
    return null;
  }
  if (ENTITY_TYPES.has(type)) {
    return knownCustomId(token.text, project.entities)
      ? null
      : warn(`unknown entity "${token.text}"`);
  }
  if (ITEM_TYPES.has(type)) {
    return knownCustomId(token.text, project.items) ? null : warn(`unknown item "${token.text}"`);
  }
  if (FUNCTION_TYPES.has(type)) {
    return project.functions.includes(token.text)
      ? null
      : warn(`unknown function "${token.text}"`, "create");
  }
  if (type === "BOOLEAN" || type === "BOOL") {
    return token.text === "true" || token.text === "false"
      ? null
      : fail(`expected true or false for ${field.title}`);
  }
  if (type === "INT" || type === "WILDCARDINT") {
    return INT_PATTERN.test(token.text) ? null : fail(`expected a number for ${field.title}`);
  }
  if (
    type === "FLOAT" ||
    type === "RVAL" ||
    type === "VAL" ||
    type === "ROTATION" ||
    type === "ROT"
  ) {
    return NUM_PATTERN.test(token.text) ? null : fail(`expected a number for ${field.title}`);
  }
  if (type === "POSITION" || type === "POSITION_FLOAT") {
    return COORD_PATTERN.test(token.text) ? null : fail(`expected a coordinate for ${field.title}`);
  }
  const form = data.types.get(`type_${type.toLowerCase()}`);
  if (form && form.samples.length > 0) {
    const lower = token.text.toLowerCase();
    if (!form.samples.some((sample) => sample.label.toLowerCase() === lower)) {
      return fail(`expected ${form.hint ?? field.title} for ${field.title}`);
    }
  }
  return null;
}

export interface SignatureData {
  label: string;
  documentation: string;
  parameters: { label: string; documentation: string }[];
  activeParameter: number;
}

// signature for the command on this line. single flattened signature, no overloads.
export function signatureAt(
  tokens: string[],
  activeIndex: number,
  data: CommandDataset,
): SignatureData | null {
  if (tokens.length === 0 || activeIndex < 1) return null;
  const command = data.commands.get(tokens[0]!);
  if (!command || command.fields.length === 0 || FLAT_SKIP.has(command.name)) return null;
  const parameters = command.fields.map((field) => {
    const type = field.commandType ? ` (${field.commandType.toLowerCase()})` : "";
    const optional = field.optional ? ", optional" : "";
    return { label: field.title, documentation: `${field.description}${type}${optional}` };
  });
  const label = `${command.name}${command.fields
    .map((field) => (field.optional ? ` [${field.title}]` : ` <${field.title}>`))
    .join("")}`;
  // same slot walk as diagnostics so @ targets never shift the highlight.
  let at = 1;
  let active = 0;
  for (const [index, field] of command.fields.entries()) {
    const takesSelector = field.commandType !== undefined && SELECTOR_TYPES.has(field.commandType);
    while (!takesSelector && at < tokens.length && tokens[at]!.startsWith("@")) at++;
    const span = fieldSpan(field.commandType);
    const width = span === Number.POSITIVE_INFINITY ? tokens.length - at : span;
    if (activeIndex <= at + width - 1 || index === command.fields.length - 1) {
      active = index;
      break;
    }
    at += width;
  }
  return { label, documentation: command.description, parameters, activeParameter: active };
}

// go to target for an identifier argument: summon/give style positions plus type= selector values.
export function gotoTarget(
  tokens: string[],
  activeIndex: number,
  data: CommandDataset,
): { kind: "entity" | "item"; id: string } | null {
  if (tokens.length === 0 || activeIndex < 1) return null;
  const token = tokens[activeIndex] ?? "";
  const selector = /[[,]type=([^,\]]+)/.exec(token);
  if (selector && selector[1]) {
    return { kind: "entity", id: selector[1].replace(/^!/, "") };
  }
  const command = data.commands.get(tokens[0]!);
  if (!command || command.fields.length === 0) return null;
  const field = command.fields[Math.min(activeIndex - 1, command.fields.length - 1)]!;
  const type = field.commandType;
  if (type === undefined) return null;
  const id = token.replace(/^["']|["']$/g, "");
  if (id === "" || id.startsWith("minecraft:") || id.startsWith("@")) return null;
  if (ENTITY_TYPES.has(type)) return { kind: "entity", id };
  if (ITEM_TYPES.has(type)) return { kind: "item", id };
  return null;
}

// valid replacement values for the argument under the cursor, backing quick fixes.
export function candidatesFor(
  tokens: string[],
  activeIndex: number,
  data: CommandDataset,
  project: ProjectValues,
): string[] {
  if (tokens.length === 0 || activeIndex < 1) return [];
  const command = data.commands.get(tokens[0]!);
  if (!command || command.fields.length === 0 || FLAT_SKIP.has(command.name)) return [];
  const field = command.fields[Math.min(activeIndex - 1, command.fields.length - 1)]!;
  const type = field.commandType;
  if (type === undefined || SKIP_TYPES.has(type)) return [];
  if (SELECTOR_TYPES.has(type)) return SELECTORS.map((row) => row.name);
  if (ENTITY_TYPES.has(type)) return [...project.entities];
  if (ITEM_TYPES.has(type)) return [...project.items];
  if (FUNCTION_TYPES.has(type)) return [...project.functions];
  const form = data.types.get(`type_${type.toLowerCase()}`);
  if (!form) return [];
  return form.samples.map((sample) => sample.label);
}

async function functionFile(
  document: vscode.TextDocument,
  path: string,
): Promise<vscode.Uri | undefined> {
  const candidates: vscode.Uri[] = [];
  try {
    candidates.push(
      vscode.Uri.joinPath(
        vscode.Uri.file((await resolveProject()).config.packs.bp),
        "functions",
        `${path}.mcfunction`,
      ),
    );
  } catch {}
  const folder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (folder) {
    candidates.push(
      vscode.Uri.joinPath(folder.uri, "packs", "BP", "functions", `${path}.mcfunction`),
    );
  }
  for (const candidate of candidates) {
    try {
      await vscode.workspace.fs.stat(candidate);
      return candidate;
    } catch {}
  }
  return undefined;
}

const DIAG_DEBOUNCE_MS = 500;

function toVscodeDiagnostic(hit: LineDiagnostic, line: number): vscode.Diagnostic {
  const range = new vscode.Range(line, hit.start, line, hit.end);
  const severity =
    hit.severity === "error" ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning;
  const diagnostic = new vscode.Diagnostic(range, hit.message, severity);
  diagnostic.source = "bedrock";
  if (hit.fix) diagnostic.code = `bedrock-${hit.fix}`;
  return diagnostic;
}

async function refreshDocument(
  collection: vscode.DiagnosticCollection,
  context: vscode.ExtensionContext,
  document: vscode.TextDocument,
  skipLine?: number,
): Promise<void> {
  if (document.languageId !== "mcfunction") return;
  const data = await loadDataset(context);
  if (!data) return;
  const project = await projectValues(document);
  const hits: vscode.Diagnostic[] = [];
  for (let line = 0; line < document.lineCount; line++) {
    if (line === skipLine) continue;
    const text = document.lineAt(line).text;
    if (text.trim() === "" || text.trimStart().startsWith("#")) continue;
    for (const hit of diagnoseLine(tokenize(text), data, project)) {
      hits.push(toVscodeDiagnostic(hit, line));
    }
  }
  collection.set(document.uri, hits);
}

export function registerMcfunctionDiagnostics(context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection("bedrock-mcfunction");
  context.subscriptions.push(collection);
  let timer: ReturnType<typeof setTimeout> | undefined;
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((document) => {
      void refreshDocument(collection, context, document);
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      void refreshDocument(collection, context, document);
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        void refreshDocument(
          collection,
          context,
          event.document,
          event.contentChanges[0]?.range.start.line,
        );
      }, DIAG_DEBOUNCE_MS);
    }),
  );
  for (const document of vscode.workspace.textDocuments) {
    void refreshDocument(collection, context, document);
  }
}

export function registerMcfunctionDefinition(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      { language: "mcfunction", scheme: "file" },
      {
        async provideDefinition(document, position) {
          const line = document.lineAt(position.line).text;
          const tokens = tokenize(line);
          const active = tokens.findIndex(
            (token) =>
              position.character >= token.start &&
              position.character <= token.start + token.text.length,
          );
          if (active === -1) return undefined;
          const path = functionPathOf(
            tokens.map((token) => token.text),
            active,
          );
          if (!path) return undefined;
          const file = await functionFile(document, path);
          if (!file) return undefined;
          return new vscode.Location(file, new vscode.Position(0, 0));
        },
      },
    ),
  );
}

export function registerMcfunctionSignature(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerSignatureHelpProvider(
      { language: "mcfunction", scheme: "file" },
      {
        async provideSignatureHelp(document, position) {
          const line = document.lineAt(position.line).text.slice(0, position.character);
          if (line.trimStart().startsWith("#")) return undefined;
          if (bracketOpen(line)) return undefined;
          const data = await loadDataset(context);
          if (!data) return undefined;
          const tokens = tokenize(line);
          const words = tokens.map((token) => token.text);
          const hit = signatureAt(words, words.length, data);
          if (!hit) return undefined;
          const info = new vscode.SignatureInformation(hit.label, hit.documentation);
          for (const parameter of hit.parameters) {
            info.parameters.push(
              new vscode.ParameterInformation(parameter.label, parameter.documentation),
            );
          }
          const help = new vscode.SignatureHelp();
          help.signatures = [info];
          help.activeSignature = 0;
          help.activeParameter = hit.activeParameter;
          return help;
        },
      },
      " ",
    ),
  );
}

// open [ without a close means the cursor is inside selector args, not params.
function bracketOpen(line: string): boolean {
  const open = line.lastIndexOf("[");
  if (open === -1) return false;
  return !line.slice(open).includes("]");
}

export function registerMcfunctionValueDefinition(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      { language: "mcfunction", scheme: "file" },
      {
        async provideDefinition(document, position) {
          const line = document.lineAt(position.line).text;
          if (line.trimStart().startsWith("#")) return undefined;
          const data = await loadDataset(context);
          if (!data) return undefined;
          const tokens = tokenize(line);
          const active = tokens.findIndex(
            (token) =>
              position.character >= token.start &&
              position.character <= token.start + token.text.length,
          );
          if (active === -1) return undefined;
          const target = gotoTarget(
            tokens.map((token) => token.text),
            active,
            data,
          );
          if (!target) return undefined;
          const hits = await findDefinition({ text: target.id, kind: "identifier" }, document);
          return hits.map((hit) => new vscode.Location(hit.file, new vscode.Position(hit.line, 0)));
        },
      },
    ),
  );
}

const MAX_FIX_OPTIONS = 6;

function replaceAction(
  uri: vscode.Uri,
  title: string,
  range: vscode.Range,
  replacement: string,
  diagnostic: vscode.Diagnostic,
): vscode.CodeAction {
  const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
  action.diagnostics = [diagnostic];
  action.edit = new vscode.WorkspaceEdit();
  action.edit.replace(uri, range, replacement);
  return action;
}

async function createFunctionFile(
  document: vscode.TextDocument,
  path: string,
  diagnostic: vscode.Diagnostic,
): Promise<vscode.CodeAction | undefined> {
  let base: string | undefined;
  try {
    base = (await resolveProject()).config.packs.bp;
  } catch {
    base = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath;
    if (base) base = `${base.replace(/\\/g, "/")}/packs/BP`;
  }
  if (!base) return undefined;
  // the id comes from file text, never let it escape the pack.
  if (path === "" || path.includes("..")) return undefined;
  const uri = vscode.Uri.joinPath(vscode.Uri.file(base), "functions", `${path}.mcfunction`);
  const action = new vscode.CodeAction(`Create function ${path}`, vscode.CodeActionKind.QuickFix);
  action.diagnostics = [diagnostic];
  action.edit = new vscode.WorkspaceEdit();
  action.edit.createFile(uri, { ignoreIfExists: true });
  return action;
}

export function registerMcfunctionFixes(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { language: "mcfunction", scheme: "file" },
      {
        async provideCodeActions(document, _range, actionContext) {
          const data = await loadDataset(context);
          if (!data) return undefined;
          const project = await projectValues(document);
          const out: vscode.CodeAction[] = [];
          for (const diagnostic of actionContext.diagnostics) {
            if (diagnostic.source !== "bedrock" || typeof diagnostic.code !== "string") continue;
            if (diagnostic.code === "bedrock-remove") {
              const line = document.lineAt(diagnostic.range.start.line).text;
              out.push(
                replaceAction(
                  document.uri,
                  "Remove extra arguments",
                  new vscode.Range(
                    diagnostic.range.start,
                    new vscode.Position(diagnostic.range.start.line, line.length),
                  ),
                  "",
                  diagnostic,
                ),
              );
              continue;
            }
            if (diagnostic.code === "bedrock-create") {
              const id = /"([^"]+)"/.exec(diagnostic.message)?.[1];
              if (!id) continue;
              const created = await createFunctionFile(document, id, diagnostic);
              if (created) out.push(created);
              continue;
            }
            if (diagnostic.code !== "bedrock-replace") continue;
            const line = document.lineAt(diagnostic.range.start.line).text;
            const tokens = tokenize(line);
            const active = tokens.findIndex(
              (token) =>
                diagnostic.range.start.character >= token.start &&
                diagnostic.range.start.character <= token.start + token.text.length,
            );
            if (active === -1) continue;
            const words = tokens.map((token) => token.text);
            for (const candidate of candidatesFor(words, active, data, project).slice(
              0,
              MAX_FIX_OPTIONS,
            )) {
              out.push(
                replaceAction(
                  document.uri,
                  `Replace with \`${candidate}\``,
                  diagnostic.range,
                  candidate,
                  diagnostic,
                ),
              );
            }
          }
          return out.length > 0 ? out : undefined;
        },
      },
    ),
  );
}
