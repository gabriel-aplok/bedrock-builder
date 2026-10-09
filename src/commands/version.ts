import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { logger, printJson } from "../logger.js";
import { detectPackLayout, type ManifestTarget } from "../manifest/rewrite.js";

export interface VersionOptions {
  // project root or config path. Defaults to cwd.
  dir?: string | undefined;
  dryRun?: boolean | undefined;
  json?: boolean | undefined;
}

export interface VersionReport {
  command: "version";
  ok: boolean;
  version: string;
  configPath: string;
  manifests: string[];
  dryRun: boolean;
}

export class VersionError extends Error {
  readonly exitCode = 10;
  constructor(message: string) {
    super(message);
    this.name = "VersionError";
  }
}

const SEMVER = /^\d+\.\d+\.\d+$/;

function parseVersion(raw: string): [number, number, number] {
  const value = raw.trim();
  if (!SEMVER.test(value)) {
    throw new VersionError(`Version must be x.y.z, got "${raw}".`);
  }
  const parts = value.split(".").map(Number);
  return [parts[0]!, parts[1]!, parts[2]!];
}

// find config.json or bedrock.config.json under root.
async function locateConfig(root: string): Promise<string | null> {
  for (const name of ["config.json", "bedrock.config.json"]) {
    try {
      const raw = await readFile(resolve(root, name), "utf8");
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null) continue;
      const record = parsed as Record<string, unknown>;
      if (record.type === "minecraftBedrock" || "bb" in record || "bedrock-cli" in record) {
        return resolve(root, name);
      }
    } catch {
      continue;
    }
  }
  return null;
}

// bump the project version in config.json plus both pack manifests.
export async function version(raw: string, options: VersionOptions = {}): Promise<VersionReport> {
  const parsed = parseVersion(raw);
  const root = resolve(options.dir ?? process.cwd());

  const configPath =
    options.dir !== undefined && options.dir.endsWith(".json")
      ? resolve(options.dir)
      : await locateConfig(root);
  if (configPath === null) {
    throw new VersionError(`No config.json found under ${root}.`);
  }

  const configRaw = await readFile(configPath, "utf8");
  const config: unknown = JSON.parse(configRaw);
  if (typeof config !== "object" || config === null) {
    throw new VersionError(`Config is not a json object: ${configPath}`);
  }
  const record = config as Record<string, unknown>;
  const cliKey = "bb" in record ? "bb" : "bedrock-cli";
  if (
    typeof record[cliKey] !== "object" ||
    record[cliKey] === null ||
    Array.isArray(record[cliKey])
  ) {
    throw new VersionError(`Config has no "${cliKey}" block: ${configPath}`);
  }
  const cli = record[cliKey] as Record<string, unknown>;
  cli.version = raw.trim();
  record[cliKey] = cli;

  const configDir = dirname(configPath);
  const targets: ManifestTarget[] = await detectPackLayout(configDir);
  if (targets.length === 0) {
    throw new VersionError(
      `No pack manifests found under ${configDir}. Looked for packs/BP, BP/, and behavior_packs/.`,
    );
  }

  const written: string[] = [];
  for (const target of targets) {
    const manifestRaw = await readFile(target.path, "utf8");
    const manifest: unknown = JSON.parse(manifestRaw);
    if (typeof manifest !== "object" || manifest === null) {
      throw new VersionError(`Manifest is not a json object: ${target.path}`);
    }
    const doc = manifest as Record<string, unknown>;
    if (typeof doc.header === "object" && doc.header !== null) {
      (doc.header as Record<string, unknown>).version = parsed;
    }
    if (Array.isArray(doc.modules)) {
      for (const mod of doc.modules) {
        if (typeof mod === "object" && mod !== null) {
          (mod as Record<string, unknown>).version = parsed;
        }
      }
    }
    if (!(options.dryRun ?? false)) {
      await writeFile(target.path, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
    }
    written.push(target.path);
  }

  if (!(options.dryRun ?? false)) {
    await writeFile(configPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  }

  const result: VersionReport = {
    command: "version",
    ok: true,
    version: raw.trim(),
    configPath,
    manifests: written,
    dryRun: options.dryRun ?? false,
  };
  if (options.json ?? false) {
    printJson(result);
  } else {
    logger.success(
      (options.dryRun ?? false)
        ? `Would set version ${result.version} in ${written.length + 1} file(s)`
        : `Set version ${result.version} in ${written.length + 1} file(s)`,
    );
  }
  return result;
}
