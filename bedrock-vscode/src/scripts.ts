import * as vscode from "vscode";

import type { BedrockConfig } from "@aplok/bedrock-builder";

import { SCRIPT_PREFIX, SETTING_SCRIPT_CHECK } from "./constants.js";

export interface ScriptIssue {
  message: string;
  fix: string | null;
}

// check the script setup: entry file, tsconfig, and the server types the
// entry imports. vscode handles hover and go to once these resolve.
export async function checkScripts(
  folder: vscode.WorkspaceFolder,
  config: BedrockConfig,
): Promise<ScriptIssue[]> {
  const issues: ScriptIssue[] = [];
  if (!(await existsFile(config.entry))) {
    issues.push({
      message: `entry missing: ${config.entry}`,
      fix: "Create the file or fix bb.entry in config.json.",
    });
    return issues;
  }
  const projectDir = config.__configDir;
  const tsconfig = vscode.Uri.file(`${projectDir}/tsconfig.json`);
  if (!(await exists(tsconfig))) {
    issues.push({
      message: "no tsconfig.json, script hover and go to stay local only",
      fix: "Run bb init createing or add a tsconfig.json with src/**.",
    });
  }
  const text = await readText(vscode.Uri.file(config.entry));
  if (text === undefined) return issues;
  const mods = [...text.matchAll(/from\s+["']([^"']+)["']/g)].map((hit) => hit[1]!);
  for (const mod of new Set(mods)) {
    if (!mod.startsWith("@minecraft/")) continue;
    if (await resolves(folder, projectDir, mod)) continue;
    issues.push({
      message: `${mod} does not resolve, install it for hover and go to`,
      fix: `Run npm install in ${projectDir}.`,
    });
  }
  return issues;
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
  const issues = await checkScripts(folder, config);
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

// true when node_modules/<mod>/package.json exists in the project or its
// workspace folder. keeps the check local, no npm calls.
async function resolves(
  folder: vscode.WorkspaceFolder,
  projectDir: string,
  mod: string,
): Promise<boolean> {
  for (const base of [projectDir, folder.uri.fsPath]) {
    const pkg = vscode.Uri.file(`${base}/node_modules/${mod}/package.json`);
    if (await exists(pkg)) return true;
  }
  return false;
}

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

async function existsFile(abs: string): Promise<boolean> {
  try {
    const info = await vscode.workspace.fs.stat(vscode.Uri.file(abs));
    return info.type === vscode.FileType.File;
  } catch {
    return false;
  }
}

async function readText(uri: vscode.Uri): Promise<string | undefined> {
  try {
    const raw = await vscode.workspace.fs.readFile(uri);
    if (raw.length > 65536) return undefined;
    return Buffer.from(raw).toString("utf8");
  } catch {
    return undefined;
  }
}
