import * as vscode from "vscode";

import { MAX_COMPLETIONS, MOLANG_FORMS_PREFIX, PACKAGE_PREFIX } from "./constants.js";
import { storeVersion } from "./mcfunction.js";

export interface MolangEntry {
  label: string;
  detail: string;
}

// normalize an id like query.health or math.clamp(...) to the dotted name.
export function molangName(id: string): string | null {
  const clean = id.replace(/`/g, "");
  const cut = clean.indexOf("(");
  const name = (cut === -1 ? clean : clean.slice(0, cut)).trim();
  return /^[a-z]+\.[\w.]+$/.test(name) ? name : null;
}

export function parseMolang(files: { name: string; text: string }[]): Map<string, MolangEntry> {
  const out = new Map<string, MolangEntry>();
  for (const file of files) {
    let doc: unknown;
    try {
      doc = JSON.parse(file.text);
    } catch {
      continue;
    }
    if (typeof doc !== "object" || doc === null) continue;
    const record = doc as Record<string, unknown>;
    if (typeof record.id !== "string") continue;
    const name = molangName(record.id);
    if (!name || out.has(name)) continue;
    out.set(name, {
      label: name,
      detail: typeof record.description === "string" ? record.description : "",
    });
  }
  return out;
}

export type MolangScope = "query" | "math" | "variable";

// trailing dotted scope in a json string, like query.h or variable.foo.
export function molangScope(prefix: string): { scope: MolangScope; stem: string } | null {
  const hit =
    /(query|math|variable|v|t|c|temp|context|array|geometry|texture|material)\.([\w.]*)$/.exec(
      prefix,
    );
  if (!hit) return null;
  const head = hit[1]!;
  const scope: MolangScope = head === "query" ? "query" : head === "math" ? "math" : "variable";
  return { scope, stem: `${head}.${hit[2]!}` };
}

export function suggestMolang(
  stem: string,
  scope: MolangScope,
  data: Map<string, MolangEntry>,
  variables: string[],
): MolangEntry[] {
  const pool =
    scope === "variable"
      ? variables.map((label) => ({ label, detail: "project variable" }))
      : [...data.values()].filter((entry) => entry.label.startsWith(`${scope}.`));
  return pool.filter((entry) => entry.label.startsWith(stem)).slice(0, MAX_COMPLETIONS);
}

interface LoadedMolang {
  version: string;
  data: Map<string, MolangEntry>;
}

let loaded: LoadedMolang | undefined;

function molangSubdir(): string[] {
  return MOLANG_FORMS_PREFIX.slice(PACKAGE_PREFIX.length)
    .split("/")
    .filter((part) => part !== "");
}

export async function loadMolang(
  context: vscode.ExtensionContext,
): Promise<Map<string, MolangEntry> | undefined> {
  const version = await storeVersion();
  if (!version) return loaded?.data;
  if (loaded && loaded.version === version) return loaded.data;
  const dir = vscode.Uri.joinPath(
    context.globalStorageUri,
    "minecraft",
    version,
    "bedrock-schemas",
  );
  const subdir = molangSubdir();
  let entries: [string, vscode.FileType][];
  try {
    entries = await vscode.workspace.fs.readDirectory(vscode.Uri.joinPath(dir, ...subdir));
  } catch {
    return loaded?.data;
  }
  const files: { name: string; text: string }[] = [];
  for (const [name] of entries) {
    if (!name.endsWith(".form.json")) continue;
    try {
      const raw = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(dir, ...subdir, name));
      files.push({ name, text: Buffer.from(raw).toString("utf8") });
    } catch {}
  }
  const data = parseMolang(files);
  if (data.size === 0) return loaded?.data;
  loaded = { version, data };
  return data;
}

// documented scopes only. variables have no reference text.
const HOVER_SCOPES = new Set(["query", "math"]);

// dotted molang word under the cursor: query.health, math.clamp; null on plain text.
export function molangWordAt(line: string, character: number): string | null {
  const re = /((?:query|math)\.[\w.]+)/g;
  for (const hit of line.matchAll(re)) {
    const start = hit.index ?? -1;
    const end = start + hit[1]!.length;
    if (character >= start && character <= end) {
      const head = hit[1]!.slice(0, hit[1]!.indexOf("."));
      if (HOVER_SCOPES.has(head)) return hit[1]!;
    }
  }
  return null;
}

export function registerMolangHover(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      [
        { language: "json", scheme: "file" },
        { language: "jsonc", scheme: "file" },
      ],
      {
        async provideHover(document, position) {
          const word = molangWordAt(document.lineAt(position.line).text, position.character);
          if (!word) return undefined;
          const data = await loadMolang(context);
          const entry = data?.get(word);
          if (!entry || entry.detail === "") return undefined;
          return new vscode.Hover([`$(symbol-function) ${entry.label}`, entry.detail]);
        },
      },
    ),
  );
}
