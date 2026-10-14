import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { BedrockConfig } from "../config.js";
import { logger, printJson } from "../logger.js";
import { manifestVersion } from "../pipeline/manifest.js";
import { isRecord } from "../records.js";
import { runTool } from "../process.js";
import { latestRange } from "./init.js";

export interface UpdateOptions {
  dryRun?: boolean | undefined;
  json?: boolean | undefined;
}

export interface UpdatedDep {
  name: string;
  from: string;
  to: string;
}

export interface UpdateReport {
  command: "update";
  ok: boolean;
  updated: UpdatedDep[];
  installed: boolean;
  manifest: string | null;
  dryRun: boolean;
}

export class UpdateError extends Error {
  readonly exitCode = 13;
  constructor(message: string) {
    super(message);
    this.name = "UpdateError";
  }
}

const TARGETS = [
  { name: "@minecraft/server", section: "dependencies" as const },
  { name: "@aplok/bedrock-builder", section: "devDependencies" as const },
];

function sectionDeps(pkg: Record<string, unknown>, section: string): Record<string, string> | null {
  const raw = pkg[section];
  if (!isRecord(raw)) return null;
  return raw as Record<string, string>;
}

export async function update(
  config: BedrockConfig,
  options: UpdateOptions = {},
): Promise<UpdateReport> {
  const pkgPath = join(config.__configDir, "package.json");
  let pkg: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(await readFile(pkgPath, "utf8"));
    if (!isRecord(parsed)) {
      throw new UpdateError(`Invalid package.json: ${pkgPath}`);
    }
    pkg = parsed;
  } catch (err) {
    if (err instanceof UpdateError) throw err;
    throw new UpdateError(`Cannot read package.json: ${pkgPath}`);
  }

  const updated: UpdatedDep[] = [];
  for (const target of TARGETS) {
    const deps = sectionDeps(pkg, target.section);
    const current = deps?.[target.name];
    if (deps === null || typeof current !== "string") continue;
    const latest = await latestRange(target.name, current);
    if (latest !== current) {
      updated.push({ name: target.name, from: current, to: latest });
      deps[target.name] = latest;
    }
  }

  const dryRun = options.dryRun ?? false;
  if (!dryRun && updated.length > 0) {
    await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
  }

  let installed = false;
  if (!dryRun && updated.length > 0) {
    installed = await runInstall(config.__configDir);
  }

  let manifest: string | null = null;
  if (!dryRun && updated.some((dep) => dep.name === "@minecraft/server")) {
    manifest = await syncManifestServer(config);
  }

  const report: UpdateReport = {
    command: "update",
    ok: true,
    updated,
    installed,
    manifest,
    dryRun,
  };
  if (options.json ?? false) {
    printJson(report);
  } else if (dryRun) {
    if (updated.length === 0) logger.info("Everything is up to date.");
    for (const dep of updated) logger.info(`Would update ${dep.name}: ${dep.from} -> ${dep.to}`);
  } else {
    if (updated.length === 0) logger.success("Everything is up to date.");
    for (const dep of updated) logger.success(`Updated ${dep.name}: ${dep.from} -> ${dep.to}`);
    if (manifest !== null) logger.info(`Synced BP manifest server version (${manifest}).`);
  }
  return report;
}

function runInstall(dir: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = runTool("npm", ["install", "--no-audit", "--no-fund"], { cwd: dir });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

// point the bp manifest server dependency at the installed version.
async function syncManifestServer(config: BedrockConfig): Promise<string | null> {
  const path = join(config.packs.bp, "manifest.json");
  let installed: string | null = null;
  try {
    const pkg: unknown = JSON.parse(
      await readFile(
        join(config.__configDir, "node_modules", "@minecraft", "server", "package.json"),
        "utf8",
      ),
    );
    if (isRecord(pkg) && typeof pkg.version === "string") installed = pkg.version;
  } catch {
    return null;
  }
  if (installed === null || manifestVersion(installed) === null) return null;
  let manifest: unknown;
  try {
    manifest = JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
  if (!isRecord(manifest)) return null;
  const deps = manifest.dependencies;
  if (!Array.isArray(deps)) return null;
  let touched = false;
  for (const dep of deps) {
    if (!isRecord(dep)) continue;
    if (dep.module_name === "@minecraft/server" && dep.version !== installed) {
      dep.version = installed;
      touched = true;
    }
  }
  if (!touched) return null;
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return installed;
}
