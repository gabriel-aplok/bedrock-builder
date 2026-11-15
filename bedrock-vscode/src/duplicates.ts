import * as vscode from "vscode";

import { readCapped } from "./goto.js";

export interface DuplicateSite {
  file: vscode.Uri;
  line: number;
  start: number;
  end: number;
}

export interface DuplicateGroup {
  id: string;
  sites: DuplicateSite[];
}

// identifiers defined in more than one file; positions only.
export function findDuplicates(files: { uri: vscode.Uri; text: string }[]): DuplicateGroup[] {
  const owners = new Map<string, DuplicateSite[]>();
  for (const file of files) {
    const pattern = /"identifier"\s*:\s*"([^"]+)"/g;
    for (const hit of file.text.matchAll(pattern)) {
      const id = hit[1]!;
      if (id === "") continue;
      const at = (hit.index ?? 0) + hit[0]!.indexOf(id);
      const lineStart = file.text.lastIndexOf("\n", at) + 1;
      const line = lineOf(file.text, at);
      const start = at - lineStart;
      owners.set(id, [
        ...(owners.get(id) ?? []),
        { file: file.uri, line, start, end: start + id.length },
      ]);
    }
  }
  const out: DuplicateGroup[] = [];
  for (const [id, sites] of owners) {
    if (new Set(sites.map((site) => site.file.fsPath)).size > 1) out.push({ id, sites });
  }
  out.sort((a, b) => (a.id < b.id ? -1 : 1));
  return out;
}

function lineOf(text: string, index: number): number {
  let line = 0;
  for (let at = 0; at < index; at++) if (text[at] === "\n") line++;
  return line;
}

async function folderDiagnostics(
  folder: vscode.WorkspaceFolder,
): Promise<Map<string, vscode.Diagnostic[]>> {
  const pattern = new vscode.RelativePattern(folder, "packs/**/*.json");
  const uris = await vscode.workspace.findFiles(pattern, "**/node_modules/**", 2000);
  const files: { uri: vscode.Uri; text: string }[] = [];
  for (const uri of uris) {
    const text = await readCapped(uri);
    if (text !== undefined) files.push({ uri, text });
  }
  const byFile = new Map<string, vscode.Diagnostic[]>();
  for (const group of findDuplicates(files)) {
    for (const site of group.sites) {
      const others = group.sites
        .filter((other) => other.file.fsPath !== site.file.fsPath)
        .map((other) => other.file.fsPath.split(/[\\/]/).pop() ?? other.file.fsPath);
      const diagnostic = new vscode.Diagnostic(
        new vscode.Range(site.line, site.start, site.line, site.end),
        `duplicate identifier "${group.id}"${others.length > 0 ? `, also in ${others.join(", ")}` : ""}`,
        vscode.DiagnosticSeverity.Warning,
      );
      diagnostic.source = "bedrock";
      diagnostic.code = "bedrock-duplicate";
      byFile.set(site.file.fsPath, [...(byFile.get(site.file.fsPath) ?? []), diagnostic]);
    }
  }
  return byFile;
}

export function registerDuplicateWarnings(context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection("bedrock-duplicates");
  context.subscriptions.push(collection);
  // one clear set per run so concurrent folder scans never wipe each other.
  const refresh = async (): Promise<void> => {
    const merged = new Map<string, vscode.Diagnostic[]>();
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      try {
        for (const [fsPath, hits] of await folderDiagnostics(folder)) {
          merged.set(fsPath, [...(merged.get(fsPath) ?? []), ...hits]);
        }
      } catch {}
    }
    collection.clear();
    for (const [fsPath, hits] of merged) {
      collection.set(vscode.Uri.file(fsPath), hits);
    }
  };
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (document.languageId === "json" || document.languageId === "jsonc") {
        void refresh().catch(() => undefined);
      }
    }),
  );
  void refresh().catch(() => undefined);
}

async function currentGroups(document: vscode.TextDocument): Promise<DuplicateGroup[]> {
  const folder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!folder) return [];
  const pattern = new vscode.RelativePattern(folder, "packs/**/*.json");
  const uris = await vscode.workspace.findFiles(pattern, "**/node_modules/**", 2000);
  const files: { uri: vscode.Uri; text: string }[] = [];
  for (const uri of uris) {
    const text = await readCapped(uri);
    if (text !== undefined) files.push({ uri, text });
  }
  return findDuplicates(files);
}

export function registerDuplicateNavigation(context: vscode.ExtensionContext): void {
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
            if (diagnostic.source !== "bedrock" || diagnostic.code !== "bedrock-duplicate") {
              continue;
            }
            const id = /"([^"]+)"/.exec(diagnostic.message)?.[1];
            if (!id) continue;
            const group = (await currentGroups(document).catch(() => [])).find(
              (entry) => entry.id === id,
            );
            if (!group) continue;
            for (const site of group.sites) {
              if (site.file.fsPath === document.uri.fsPath) continue;
              const name = site.file.fsPath.split(/[\\/]/).pop() ?? site.file.fsPath;
              const action = new vscode.CodeAction(
                `Go to "${id}" in ${name}`,
                vscode.CodeActionKind.QuickFix,
              );
              action.diagnostics = [diagnostic];
              action.command = {
                command: "vscode.open",
                title: "Open duplicate definition",
                arguments: [
                  site.file,
                  { selection: new vscode.Range(site.line, site.start, site.line, site.end) },
                ],
              };
              out.push(action);
            }
          }
          return out.length > 0 ? out : undefined;
        },
      },
    ),
  );
}
