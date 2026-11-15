import * as vscode from "vscode";

const SPAWN_EVENT = "minecraft:entity_spawned";

// true when a behavior entity file has no spawn event key.
export function missingSpawnEvent(text: string, fsPath: string): boolean {
  if (!fsPath.includes("entities")) return false;
  if (!text.includes("minecraft:entity")) return false;
  if (/\"minecraft:[^\"]*spawn[^\"]*\"\s*:/.test(text)) return false;
  return true;
}

// find the matching close brace, skipping quoted strings.
function matchClose(text: string, open: number): number {
  let depth = 0;
  let string: string | null = null;
  for (let at = open; at < text.length; at++) {
    const char = text[at]!;
    if (string) {
      if (char === "\\") at++;
      else if (char === string) string = null;
      continue;
    }
    if (char === '"' || char === "'") {
      string = char;
      continue;
    }
    if (char === "{") depth++;
    if (char === "}") {
      depth--;
      if (depth === 0) return at;
    }
  }
  return -1;
}

function blockOpen(text: string, key: string): number {
  const hit = new RegExp(`"${key}"\\s*:\\s*\\{`).exec(text);
  if (!hit || hit.index === undefined) return -1;
  return hit.index + hit[0]!.length - 1;
}

// compute spawn event insert offsets; null when the shape is unknown.
export function spawnEdit(text: string): { start: number; end: number; insert: string } | null {
  const open = blockOpen(text, "events");
  if (open !== -1) {
    const close = matchClose(text, open);
    if (close === -1) return null;
    const inner = text.slice(open + 1, close);
    if (inner.trim() === "") {
      return { start: open + 1, end: close, insert: `\n        "${SPAWN_EVENT}": {}\n      ` };
    }
    return { start: open + 1, end: open + 1, insert: `\n        "${SPAWN_EVENT}": {},` };
  }
  const description = blockOpen(text, "description");
  if (description === -1) return null;
  const close = matchClose(text, description);
  if (close === -1) return null;
  return {
    start: close + 1,
    end: close + 1,
    insert: `,\n      "events": {\n        "${SPAWN_EVENT}": {}\n      }`,
  };
}

function diagnosticRange(document: vscode.TextDocument): vscode.Range {
  const text = document.getText();
  const hit = /"identifier"\s*:\s*"([^"]+)"/.exec(text);
  if (hit && hit[1]) {
    const at = (hit.index ?? 0) + hit[0]!.indexOf(hit[1]!);
    const start = document.positionAt(at);
    const end = document.positionAt(at + hit[1]!.length);
    return new vscode.Range(start, end);
  }
  return new vscode.Range(0, 0, 0, 1);
}

async function refreshDocument(
  collection: vscode.DiagnosticCollection,
  document: vscode.TextDocument,
): Promise<void> {
  if (document.languageId !== "json" && document.languageId !== "jsonc") return;
  if (!missingSpawnEvent(document.getText(), document.uri.fsPath)) {
    collection.delete(document.uri);
    return;
  }
  const diagnostic = new vscode.Diagnostic(
    diagnosticRange(document),
    `missing spawn event "${SPAWN_EVENT}"`,
    vscode.DiagnosticSeverity.Warning,
  );
  diagnostic.source = "bedrock";
  diagnostic.code = "bedrock-spawn-event";
  collection.set(document.uri, [diagnostic]);
}

export function registerSpawnDiagnostics(context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection("bedrock-spawn");
  context.subscriptions.push(collection);
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((document) => {
      void refreshDocument(collection, document);
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      void refreshDocument(collection, document);
    }),
  );
  for (const document of vscode.workspace.textDocuments) {
    void refreshDocument(collection, document);
  }
}

export function registerSpawnFixes(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      [
        { language: "json", scheme: "file" },
        { language: "jsonc", scheme: "file" },
      ],
      {
        provideCodeActions(document, _range, actionContext) {
          for (const diagnostic of actionContext.diagnostics) {
            if (diagnostic.source !== "bedrock" || diagnostic.code !== "bedrock-spawn-event") {
              continue;
            }
            const edit = spawnEdit(document.getText());
            if (!edit) return undefined;
            const action = new vscode.CodeAction(
              `Add spawn event "${SPAWN_EVENT}"`,
              vscode.CodeActionKind.QuickFix,
            );
            action.diagnostics = [diagnostic];
            action.edit = new vscode.WorkspaceEdit();
            action.edit.replace(
              document.uri,
              new vscode.Range(document.positionAt(edit.start), document.positionAt(edit.end)),
              edit.insert,
            );
            return [action];
          }
          return undefined;
        },
      },
    ),
  );
}
