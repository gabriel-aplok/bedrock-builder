import * as vscode from "vscode";
import { join } from "node:path";

import type { BedrockConfig } from "@aplok/bedrock-builder";
import { loadConfig } from "@aplok/bedrock-builder/editor";

import { CONFIG_FILES, SETTING_CONFIG_PATH } from "./constants.js";

export interface ResolvedProject {
  folder: vscode.WorkspaceFolder;
  configPath: string;
  config: BedrockConfig;
}

export async function findConfigPath(folder: vscode.WorkspaceFolder): Promise<string> {
  const configured = vscode.workspace
    .getConfiguration(undefined, folder.uri)
    .get<string>(SETTING_CONFIG_PATH, "")
    .trim();
  if (configured !== "") {
    const abs = join(folder.uri.fsPath, configured);
    if (!(await exists(abs))) throw new Error(`Config not found: ${abs}. Fix bedrock.configPath.`);
    return abs;
  }
  for (const name of CONFIG_FILES) {
    const abs = join(folder.uri.fsPath, name);
    if (await exists(abs)) return abs;
  }
  throw new Error(
    `No config.json in ${folder.uri.fsPath}. Set bedrock.configPath or open a Bedrock project.`,
  );
}

// resolve the project for the active editor, else the first folder.
export async function resolveProject(): Promise<ResolvedProject> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) throw new Error("Open a Bedrock project folder first.");
  const active = vscode.window.activeTextEditor?.document.uri;
  const folder = (active ? vscode.workspace.getWorkspaceFolder(active) : undefined) ?? folders[0]!;
  const configPath = await findConfigPath(folder);
  return { folder, configPath, config: await loadConfig(configPath) };
}

async function exists(abs: string): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(abs));
    return true;
  } catch {
    return false;
  }
}
