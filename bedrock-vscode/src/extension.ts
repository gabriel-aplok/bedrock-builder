import * as vscode from "vscode";

import { findDefinition, wordAt } from "./goto.js";
import { registerCommands } from "./commands.js";
import {
  SCRIPT_PREFIX,
  SETTING_CONFIG_PATH,
  SETTING_SCHEMA_AUTO,
  SETTING_SCHEMA_VERSION,
  SETTING_SCRIPT_CHECK,
  SETTING_VERBOSE,
  STATUS_TEXT_PREFIX,
} from "./constants.js";
import { resolveProject } from "./config.js";
import { ensureSchemas } from "./schemas.js";
import { reportScriptIssues } from "./scripts.js";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  status.text = `${STATUS_TEXT_PREFIX}: ...`;
  status.command = "bedrock.schema.select";
  status.tooltip = "Mojang schema version";
  status.show();
  context.subscriptions.push(status);

  const scriptStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
  scriptStatus.text = `${SCRIPT_PREFIX}: ...`;
  scriptStatus.command = "bedrock.scripts.check";
  scriptStatus.tooltip = "Script setup";
  scriptStatus.show();
  context.subscriptions.push(scriptStatus);

  registerCommands(context, status);

  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      { language: "json", scheme: "file" },
      {
        async provideDefinition(document, position) {
          const target = wordAt(document, position);
          if (!target) return undefined;
          const hits = await findDefinition(target, document);
          return hits.map((hit) => new vscode.Location(hit.file, new vscode.Position(hit.line, 0)));
        },
      },
    ),
    vscode.languages.registerDefinitionProvider(
      { language: "jsonc", scheme: "file" },
      {
        async provideDefinition(document, position) {
          const target = wordAt(document, position);
          if (!target) return undefined;
          const hits = await findDefinition(target, document);
          return hits.map((hit) => new vscode.Location(hit.file, new vscode.Position(hit.line, 0)));
        },
      },
    ),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration(SETTING_SCHEMA_VERSION) ||
        event.affectsConfiguration(SETTING_SCHEMA_AUTO) ||
        event.affectsConfiguration(SETTING_CONFIG_PATH) ||
        event.affectsConfiguration(SETTING_SCRIPT_CHECK) ||
        event.affectsConfiguration(SETTING_VERBOSE)
      ) {
        void autoSchemas(context, status, "settings changed");
        void autoScripts(scriptStatus);
      }
    }),
  );

  await autoSchemas(context, status, "startup");
  await autoScripts(scriptStatus);
}

async function autoSchemas(
  context: vscode.ExtensionContext,
  status: vscode.StatusBarItem,
  reason: string,
): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    status.text = `${STATUS_TEXT_PREFIX}: no folder`;
    return;
  }
  const auto = vscode.workspace
    .getConfiguration(undefined, folder.uri)
    .get<boolean>(SETTING_SCHEMA_AUTO, true);
  if (!auto) {
    status.text = `${STATUS_TEXT_PREFIX}: off`;
    return;
  }
  await ensureSchemas(context, status, reason);
}

async function autoScripts(status: vscode.StatusBarItem): Promise<void> {
  let project: Awaited<ReturnType<typeof resolveProject>> | undefined;
  try {
    project = await resolveProject();
  } catch {
    status.text = `${SCRIPT_PREFIX}: no project`;
    return;
  }
  await reportScriptIssues(project.folder, project.config, status);
}

export function deactivate(): void {
  // nothing to tear down, vscode disposes channels and watchers.
}
