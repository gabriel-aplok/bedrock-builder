import * as vscode from "vscode";

import { searchItemDefinition } from "./goto.js";

export interface ItemRef {
  line: number;
  start: number;
  end: number;
  id: string;
}

// item values on one document; pure over text.
export function findItemRefs(text: string): ItemRef[] {
  const out: ItemRef[] = [];
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    for (const hit of line.matchAll(/"item"\s*:\s*"([^"]+)"/g)) {
      const id = hit[1]!;
      if (id === "") continue;
      const start = (hit.index ?? 0) + hit[0]!.indexOf(id);
      out.push({ line: index, start, end: start + id.length, id });
    }
  });
  return out;
}

// vanilla ids and runtime values never warn.
export function isSkippedItem(id: string): boolean {
  return id.startsWith("minecraft:") || id.includes("$") || id.includes("{{") || id.includes("}}");
}

async function refreshDocument(
  collection: vscode.DiagnosticCollection,
  document: vscode.TextDocument,
  skipLine?: number,
): Promise<void> {
  if (document.languageId !== "json" && document.languageId !== "jsonc") return;
  const hits: vscode.Diagnostic[] = [];
  for (const ref of findItemRefs(document.getText())) {
    if (ref.line === skipLine) continue;
    if (isSkippedItem(ref.id)) continue;
    const found = await searchItemDefinition(document, ref.id).catch(() => undefined);
    if (found) continue;
    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(ref.line, ref.start, ref.line, ref.end),
      `missing item "${ref.id}"`,
      vscode.DiagnosticSeverity.Warning,
    );
    diagnostic.source = "bedrock";
    diagnostic.code = "bedrock-missing-item";
    hits.push(diagnostic);
  }
  collection.set(document.uri, hits);
}

const DIAG_DEBOUNCE_MS = 500;

export function registerItemDiagnostics(context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection("bedrock-items");
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
