import type { BedrockConfig } from "../config.js";
import { logger, printJson } from "../logger.js";
import {
  extensionRootFor,
  inspectExtensions,
  installExtensionDeps,
  missingExtensionDeps,
  readManifestFor,
  resolveExtensionPath,
} from "../pipeline/loader.js";

export interface ExtOptions {
  json?: boolean | undefined;
  install?: boolean | undefined;
}

export async function extensions(config: BedrockConfig, options: ExtOptions = {}): Promise<void> {
  if (options.install ?? false) {
    await installAll(config, options.json ?? false);
    return;
  }
  const rows = await inspectExtensions(config);
  if (options.json ?? false) {
    printJson({ command: "ext", ok: true, extensions: rows });
    return;
  }
  if (rows.length === 0) {
    logger.info("no extensions configured");
    return;
  }
  for (const row of rows) {
    if (row.status === "ok") {
      const names = row.processors.join(", ");
      logger.info(`${row.spec} -> ${row.path} (${names})`);
      if (row.missingDeps && row.missingDeps.length > 0) {
        logger.warn(
          `${row.spec}: missing deps (${row.missingDeps.join(", ")}), run bb ext --install`,
        );
      }
      for (const extensionCheck of row.checks ?? []) {
        const detail = extensionCheck.detail;
        if (extensionCheck.ok) {
          logger.info(`${row.spec}: check ok: ${extensionCheck.name} (${detail})`);
        } else {
          logger.warn(
            `${row.spec}: check failed: ${extensionCheck.name} (${detail})${
              extensionCheck.fix ? `, ${extensionCheck.fix}` : ""
            }`,
          );
        }
      }
      continue;
    }
    logger.warn(`${row.spec}: ${row.reason} (${row.path ?? "unresolved"})`);
  }
}

async function installAll(config: BedrockConfig, json: boolean): Promise<void> {
  const installed: string[] = [];
  const failed: { spec: string; reason: string }[] = [];
  for (const raw of config.extensions ?? []) {
    const spec = typeof raw === "string" ? raw : raw.name;
    const entry = await resolveExtensionPath(spec, config.__configDir);
    if (entry === null) {
      failed.push({ spec, reason: "not found" });
      continue;
    }
    const root = await extensionRootFor(entry);
    if (root === null) {
      failed.push({ spec, reason: "no manifest dir" });
      continue;
    }
    const manifest = await readManifestFor(root);
    const deps = manifest?.dependencies ?? {};
    if (Object.keys(deps).length === 0) {
      installed.push(spec);
      continue;
    }
    const missing = await missingExtensionDeps(root, deps);
    if (missing.length === 0) {
      installed.push(spec);
      continue;
    }
    const result = await installExtensionDeps(root, deps);
    if (result.ok) installed.push(spec);
    else failed.push({ spec, reason: result.output || "npm install failed" });
  }
  if (json) {
    printJson({ command: "ext", ok: failed.length === 0, installed, failed });
    return;
  }
  for (const spec of installed) logger.success(`ext ready: ${spec}`);
  for (const entry of failed) logger.error(`ext failed: ${entry.spec} (${entry.reason})`);
}
