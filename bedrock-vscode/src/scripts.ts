import * as vscode from "vscode";

import { checkScriptImports, type BedrockConfig } from "@aplok/bedrock-builder";

import { SCRIPT_PREFIX, SETTING_SCRIPT_CHECK } from "./constants.js";

export interface ScriptIssue {
  message: string;
  fix: string | null;
}

// script setup through the core check: runtime imports, BP manifest
// dependency, and the installed server major.
export async function checkScripts(config: BedrockConfig): Promise<ScriptIssue[]> {
  const report = await checkScriptImports(
    config.entry,
    config.__configDir,
    `${config.packs.bp}/manifest.json`,
  );
  if (report.ok) return [];
  return [{ message: report.detail, fix: report.fix }];
}

export async function reportScriptIssues(
  folder: vscode.WorkspaceFolder,
  config: BedrockConfig,
  status: vscode.StatusBarItem,
): Promise<void> {
  const enabled = vscode.workspace
    .getConfiguration(undefined, folder.uri)
    .get<boolean>(SETTING_SCRIPT_CHECK, true);
  if (!enabled) {
    status.text = `${SCRIPT_PREFIX}: off`;
    return;
  }
  const issues = await checkScripts(config);
  if (issues.length === 0) {
    status.text = `${SCRIPT_PREFIX}: ok`;
    return;
  }
  status.text = `${SCRIPT_PREFIX}: ${issues.length} issue${issues.length === 1 ? "" : "s"}`;
  const first = issues[0]!;
  const detail = first.fix ? `${first.message}. ${first.fix}` : first.message;
  const pick = await vscode.window.showWarningMessage(
    `Bedrock scripts: ${detail}`,
    "Open entry",
    "Dismiss",
  );
  if (pick === "Open entry") {
    const doc = await vscode.workspace.openTextDocument(config.entry);
    await vscode.window.showTextDocument(doc);
  }
}
