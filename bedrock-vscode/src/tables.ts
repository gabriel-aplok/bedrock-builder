import * as vscode from "vscode";

import { resolveProject } from "./config.js";
import { resolveTableRef } from "./goto.js";

export interface TableRef {
  line: number;
  start: number;
  end: number;
  path: string;
}

// table values on one document; pure over text.
export function findTableRefs(text: string): TableRef[] {
  const out: TableRef[] = [];
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    for (const hit of line.matchAll(/"table"\s*:\s*"([^"]+)"/g)) {
      const path = hit[1]!;
      if (path === "") continue;
      const start = (hit.index ?? 0) + hit[0]!.indexOf(path);
      out.push({ line: index, start, end: start + path.length, path });
    }
  });
  return out;
}

// dynamic paths resolve at runtime, so they never warn.
export function isDynamicTable(path: string): boolean {
  return path.includes("$") || path.includes("{{") || path.includes("}}");
}

async function refreshDocument(
  collection: vscode.DiagnosticCollection,
  document: vscode.TextDocument,
  skipLine?: number,
): Promise<void> {
  if (document.languageId !== "json" && document.languageId !== "jsonc") return;
  const hits: vscode.Diagnostic[] = [];
  for (const ref of findTableRefs(document.getText())) {
    if (ref.line === skipLine) continue;
    if (isDynamicTable(ref.path)) continue;
    const found = await resolveTableRef(document, ref.path).catch(() => undefined);
    if (found) continue;
    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(ref.line, ref.start, ref.line, ref.end),
      `missing table "${ref.path}"`,
      vscode.DiagnosticSeverity.Warning,
    );
    diagnostic.source = "bedrock";
    diagnostic.code = "bedrock-missing-table";
    hits.push(diagnostic);
  }
  collection.set(document.uri, hits);
}

const DIAG_DEBOUNCE_MS = 500;

export function registerTableDiagnostics(context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection("bedrock-tables");
  context.subscriptions.push(collection);
  let timer: ReturnType<typeof setTimeout> | undefined;
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((document) => {
      void refreshDocument(collection, document);
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      void refreshDocument(collection, document);
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        void refreshDocument(collection, event.document, event.contentChanges[0]?.range.start.line);
      }, DIAG_DEBOUNCE_MS);
    }),
  );
  for (const document of vscode.workspace.textDocuments) {
    void refreshDocument(collection, document);
  }
}

const EMPTY_LOOT_TABLE = '{\n  "pools": []\n}\n';

async function createTableFile(
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
  // the path comes from file text, never let it escape the pack.
  if (path === "" || path.includes("..")) return undefined;
  if (path.includes("$") || path.includes("{{") || path.includes("}}")) return undefined;
  const uri = vscode.Uri.joinPath(vscode.Uri.file(base), `${path}.json`);
  const action = new vscode.CodeAction(`Create table ${path}`, vscode.CodeActionKind.QuickFix);
  action.diagnostics = [diagnostic];
  action.edit = new vscode.WorkspaceEdit();
  action.edit.createFile(uri, { ignoreIfExists: true });
  action.edit.insert(uri, new vscode.Position(0, 0), EMPTY_LOOT_TABLE);
  return action;
}

export function registerTableFixes(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      [
        { language: "json", scheme: "file" },
        { language: "jsonc", scheme: "file" },
      ],
      {
        async provideCodeActions(document, _range, actionContext) {
          const out: vscode.CodeAction[] = [];
          for (const diagnostic of actionContext.diagnostics) {
            if (diagnostic.source !== "bedrock" || diagnostic.code !== "bedrock-missing-table") {
              continue;
            }
            const path = /"([^"]+)"/.exec(diagnostic.message)?.[1];
            if (!path) continue;
            const created = await createTableFile(document, path, diagnostic);
            if (created) out.push(created);
          }
          return out.length > 0 ? out : undefined;
        },
      },
    ),
  );
}
