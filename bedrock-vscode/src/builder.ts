import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as vscode from "vscode";

import type * as BuilderModule from "@aplok/bedrock-builder";

import { findConfigPath, type ResolvedProject } from "./config.js";

// full builder API, loaded per project so native deps come from there.
export type Builder = typeof BuilderModule;

export interface ResolvedBuilder extends ResolvedProject {
  bb: Builder;
}

const BUILDER_PACKAGE = "@aplok/bedrock-builder";

// resolve the builder for a folder; the require base sits in the project.
export async function loadBuilder(folder: vscode.WorkspaceFolder): Promise<Builder> {
  const req = createRequire(join(folder.uri.fsPath, "package.json"));
  let resolved: string;
  try {
    resolved = req.resolve(BUILDER_PACKAGE);
  } catch {
    throw new Error(
      `Builder not found in ${folder.uri.fsPath}. Run npm install ${BUILDER_PACKAGE}.`,
    );
  }
  return (await import(pathToFileURL(resolved).href)) as Builder;
}

// resolve the project plus its builder; config comes from the builder.
export async function resolveBuilder(): Promise<ResolvedBuilder> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) throw new Error("Open a Bedrock project folder first.");
  const folder = vscode.workspace.workspaceFolders![0]!;
  const configPath = await findConfigPath(folder);
  const bb = await loadBuilder(folder);
  const config = await bb.loadConfig(configPath);
  return { folder, configPath, config, bb };
}
