import * as vscode from "vscode";

import {
  findLangDuplicates,
  langKeyAt,
  parseLang,
  translateKeyAt,
} from "@aplok/bedrock-builder/editor";
import { MAX_COMPLETIONS, MAX_HITS, MAX_INDEX_FILES } from "./constants.js";
import { readCapped } from "./goto.js";

// debounce keeps typing smooth on big lang files.
const LANG_DEBOUNCE_MS = 500;
const MAX_HOVER_VALUE = 300;

const LANG_GLOB = "**/*.lang";

function isLang(document: vscode.TextDocument): boolean {
  if (document.languageId === "bedrock-lang") return true;
  return document.fileName.toLowerCase().endsWith(".lang");
}

async function langFiles(): Promise<vscode.Uri[]> {
  return vscode.workspace.findFiles(LANG_GLOB, "**/node_modules/**", MAX_INDEX_FILES);
}

// other files owning the same key.
function duplicateOwners(groups: { key: string; ids: string[] }[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const group of groups) {
    for (const id of group.ids) {
      out.set(
        `${id}::${group.key}`,
        group.ids.filter((other) => other !== id),
      );
    }
  }
  return out;
}

async function refreshAll(collection: vscode.DiagnosticCollection): Promise<void> {
  const files = await langFiles();
  const texts = new Map<string, string>();
  for (const file of files) {
    const text = await readCapped(file);
    if (text !== undefined) texts.set(file.fsPath, text);
  }
  const owners = duplicateOwners(
    findLangDuplicates([...texts].map(([id, text]) => ({ id, text }))),
  );
  const byFile = new Map<string, vscode.Diagnostic[]>();
  const push = (fsPath: string, hit: vscode.Diagnostic): void => {
    byFile.set(fsPath, [...(byFile.get(fsPath) ?? []), hit]);
  };
  const warn = (message: string, range: vscode.Range): vscode.Diagnostic => {
    const hit = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Warning);
    hit.source = "bedrock";
    return hit;
  };
  for (const file of files) {
    const text = texts.get(file.fsPath);
    if (text === undefined) continue;
    const { entries, problems } = parseLang(text);
    for (const problem of problems) {
      push(
        file.fsPath,
        warn(
          problem.message,
          new vscode.Range(problem.line, problem.start, problem.line, problem.end),
        ),
      );
    }
    for (const entry of entries) {
      const key = `${file.fsPath}::${entry.key}`;
      if (!owners.has(key)) continue;
      const others = owners.get(key) ?? [];
      const names = others.map((id) => id.split(/[\\/]/).pop() ?? id);
      const suffix = names.length > 0 ? `, also in ${names.join(", ")}` : "";
      const hit = warn(
        `duplicate lang key "${entry.key}"${suffix}`,
        new vscode.Range(entry.line, entry.keyStart, entry.line, entry.keyEnd),
      );
      hit.code = "bedrock-lang-duplicate";
      push(file.fsPath, hit);
    }
  }
  collection.clear();
  for (const [fsPath, hits] of byFile) {
    collection.set(vscode.Uri.file(fsPath), hits);
  }
}

export function registerLangDiagnostics(context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection("bedrock-lang");
  context.subscriptions.push(collection);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void refreshAll(collection).catch(() => undefined);
    }, LANG_DEBOUNCE_MS);
  };
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((document) => {
      if (isLang(document)) schedule();
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (isLang(document)) schedule();
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (isLang(event.document)) schedule();
    }),
  );
  void refreshAll(collection).catch(() => undefined);
}

async function definitionOf(key: string): Promise<vscode.Location[]> {
  const out: vscode.Location[] = [];
  for (const file of await langFiles()) {
    const text = await readCapped(file);
    if (text === undefined) continue;
    for (const entry of parseLang(text).entries) {
      if (entry.key !== key) continue;
      out.push(
        new vscode.Location(
          file,
          new vscode.Range(entry.line, entry.keyStart, entry.line, entry.keyEnd),
        ),
      );
      if (out.length >= MAX_HITS) return out;
    }
  }
  return out;
}

export function registerLangDefinition(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      [
        { language: "json", scheme: "file" },
        { language: "jsonc", scheme: "file" },
      ],
      {
        async provideDefinition(document, position) {
          const key = translateKeyAt(document.lineAt(position.line).text, position.character);
          if (!key) return undefined;
          const hits = await definitionOf(key);
          return hits.length > 0 ? hits : undefined;
        },
      },
    ),
  );
}

export function registerLangHover(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      [
        { language: "bedrock-lang", scheme: "file" },
        { pattern: LANG_GLOB, scheme: "file" },
      ],
      {
        async provideHover(document, position) {
          const key = langKeyAt(document.lineAt(position.line).text, position.character);
          if (!key) return undefined;
          const { entries } = parseLang(document.getText());
          const value = entries.find((entry) => entry.key === key)?.value;
          if (value === undefined) return undefined;
          const shown =
            value.length > MAX_HOVER_VALUE ? `${value.slice(0, MAX_HOVER_VALUE)}…` : value;
          return new vscode.Hover([`$(symbol-key) ${key}`, shown === "" ? "(empty)" : shown]);
        },
      },
    ),
  );
}

export function registerLangCompletion(context: vscode.ExtensionContext): void {
  const provider: vscode.CompletionItemProvider = {
    async provideCompletionItems(document, position) {
      const before = document.lineAt(position.line).text.slice(0, position.character);
      // key position; no = yet on this line.
      if (before.includes("=") || before.trimStart().startsWith("##")) return undefined;
      const prefix = /[A-Za-z0-9_.:/-]*$/.exec(before)?.[0] ?? "";
      const known = new Set(parseLang(document.getText()).entries.map((entry) => entry.key));
      const seen = new Set<string>();
      const out: vscode.CompletionItem[] = [];
      for (const file of await langFiles()) {
        if (file.fsPath === document.uri.fsPath) continue;
        const text = await readCapped(file);
        if (text === undefined) continue;
        for (const entry of parseLang(text).entries) {
          if (seen.has(entry.key) || known.has(entry.key)) continue;
          if (!entry.key.startsWith(prefix)) continue;
          seen.add(entry.key);
          const item = new vscode.CompletionItem(entry.key, vscode.CompletionItemKind.Value);
          item.detail = `lang · ${file.fsPath.split(/[\\/]/).pop() ?? file.fsPath}`;
          out.push(item);
          if (out.length >= MAX_COMPLETIONS) return out;
        }
      }
      return out.length > 0 ? out : undefined;
    },
  };
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      [
        { language: "bedrock-lang", scheme: "file" },
        { pattern: LANG_GLOB, scheme: "file" },
      ],
      provider,
      ".",
      "_",
      ":",
    ),
  );
}
