import { isAbsolute, resolve } from "node:path";

import { deriveNamespace, validateNamespace } from "../generate/core/identifier.js";
import { logger } from "../logger.js";

export interface BedrockConfig {
  name: string;
  namespace: string;
  version: string;
  packs: { bp: string; rp: string };
  entry: string;
  out: string;
  deploy: { target: "retail" | "preview" | "custom"; customPath: string | null };
  minecraft?: { serverVersion?: string };
  extensions?: Array<ExtensionConfig | string>;
  worlds: string[];
  __configDir: string;
}

export interface Draft {
  name?: unknown;
  namespace?: unknown;
  version?: unknown;
  packs?: { bp?: unknown; rp?: unknown };
  entry?: unknown;
  out?: unknown;
  deploy?: { target?: unknown; customPath?: unknown } | undefined;
  minecraft?: { serverVersion?: unknown };
  extensions?: unknown;
  worlds?: unknown;
}

// strict semver, no loose parse.
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export class ConfigError extends Error {
  readonly exitCode: number;
  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = "ConfigError";
    this.exitCode = exitCode;
  }
}

export interface ExtensionConfig {
  name: string;
  settings: Record<string, unknown>;
}

export function isObj(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function first(...vals: unknown[]): unknown {
  for (const v of vals) if (v !== undefined) return v;
  return undefined;
}

export function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function anchored(base: string, path: string): string {
  return isAbsolute(path) ? path : resolve(base, path);
}

export function toDraft(parsed: Record<string, unknown>): Draft {
  const cli: Record<string, unknown> = isObj(parsed["bb"]) ? parsed["bb"] : {};
  const packs: Record<string, unknown> = isObj(parsed.packs) ? parsed.packs : {};
  const mc: Record<string, unknown> = isObj(parsed.minecraft) ? parsed.minecraft : {};
  const deploy = isObj(cli.deploy) ? cli.deploy : isObj(parsed.deploy) ? parsed.deploy : undefined;
  const api = first(parsed.targetVersion, mc.serverVersion);
  // standard top-level namespace wins, bb.namespace stays as fallback.
  const namespace = first(parsed.namespace, cli.namespace);
  const extensions = Array.isArray(cli.extensions)
    ? cli.extensions
    : Array.isArray(parsed.extensions)
      ? parsed.extensions
      : undefined;
  const worlds = Array.isArray(parsed.worlds)
    ? parsed.worlds.filter((w): w is string => typeof w === "string")
    : undefined;
  const draft: Draft = {
    name: parsed.name,
    namespace,
    version: first(cli.version, parsed.version),
    packs: {
      bp: first(packs.behaviorPack, packs.bp),
      rp: first(packs.resourcePack, packs.rp),
    },
    entry: first(cli.entry, parsed.entry),
    out: first(cli.out, parsed.out),
  };
  if (deploy !== undefined) draft.deploy = deploy as Draft["deploy"];
  if (api !== undefined) draft.minecraft = { serverVersion: api };
  if (extensions !== undefined) draft.extensions = extensions;
  if (worlds !== undefined) draft.worlds = worlds;
  return draft;
}

export function fillDefaults(draft: Draft, base: string): BedrockConfig {
  if (!nonEmpty(draft.name)) throw new ConfigError("Config needs a non-empty `name`.", 2);
  if (!nonEmpty(draft.version)) throw new ConfigError("Config needs a non-empty `version`.", 2);

  const packs = isObj(draft.packs) ? draft.packs : {};
  const bp = nonEmpty(packs.bp) ? packs.bp : "packs/BP";
  const rp = nonEmpty(packs.rp) ? packs.rp : "packs/RP";
  const entry = nonEmpty(draft.entry) ? draft.entry : "src/main.ts";
  const out = nonEmpty(draft.out) ? draft.out : "dist";

  const deployRaw = isObj(draft.deploy) ? draft.deploy : {};
  const want = deployRaw.target;
  const target = want === undefined ? "retail" : want;
  if (target !== "retail" && target !== "preview" && target !== "custom") {
    throw new ConfigError(
      `deploy.target must be "retail", "preview", or "custom", got ${JSON.stringify(want)}.`,
      2,
    );
  }
  let customPath: string | null = null;
  if (deployRaw.customPath !== undefined && deployRaw.customPath !== null) {
    if (typeof deployRaw.customPath !== "string") {
      throw new ConfigError("deploy.customPath must be a string or null.", 2);
    }
    customPath = deployRaw.customPath;
  }

  let namespace: string;
  if (draft.namespace === undefined || draft.namespace === null) {
    namespace = deriveNamespace(draft.name);
  } else if (typeof draft.namespace === "string" && validateNamespace(draft.namespace) === true) {
    namespace = draft.namespace;
  } else {
    namespace = deriveNamespace(draft.name);
    logger.warn(`Bad bb.namespace ${JSON.stringify(draft.namespace)}, using "${namespace}".`);
  }

  let minecraft: BedrockConfig["minecraft"];
  if (isObj(draft.minecraft)) {
    const v = draft.minecraft.serverVersion;
    if (v !== undefined && typeof v !== "string") {
      throw new ConfigError("minecraft.serverVersion (or targetVersion) must be a string.", 2);
    }
    minecraft = v === undefined ? {} : { serverVersion: v };
  }

  let extensions: BedrockConfig["extensions"];
  if (draft.extensions !== undefined) {
    if (
      !Array.isArray(draft.extensions) ||
      draft.extensions.some((entry) => {
        if (typeof entry === "string") return entry.trim() === "";
        if (!isObj(entry) || !nonEmpty(entry.name)) return true;
        return entry.settings !== undefined && !isObj(entry.settings);
      })
    ) {
      throw new ConfigError(
        `extensions must be an array of names or { name, settings } objects, got ${JSON.stringify(draft.extensions)}.`,
        2,
      );
    }
    extensions = draft.extensions.map((entry) =>
      typeof entry === "string"
        ? { name: entry, settings: {} }
        : {
            name: entry.name as string,
            settings: isObj(entry.settings) ? { ...entry.settings } : {},
          },
    );
  }

  return {
    name: draft.name,
    namespace,
    version: draft.version,
    packs: { bp: anchored(base, bp), rp: anchored(base, rp) },
    entry: anchored(base, entry),
    out: anchored(base, out),
    deploy: {
      target,
      customPath:
        customPath !== null && customPath !== "" ? anchored(base, customPath) : customPath,
    },
    ...(minecraft ? { minecraft } : {}),
    ...(extensions ? { extensions } : {}),
    worlds: Array.isArray(draft.worlds) ? [...draft.worlds] : [],
    __configDir: base,
  };
}

export async function validateConfig(
  config: BedrockConfig,
  fs: {
    isDir(path: string): Promise<boolean>;
    isFile(path: string): Promise<boolean>;
  },
): Promise<void> {
  if (!SEMVER.test(config.version)) {
    throw new ConfigError(`version ${JSON.stringify(config.version)} is not semver.`, 2);
  }
  if (!(await fs.isDir(config.packs.bp)))
    throw new ConfigError(`packs.bp missing: ${config.packs.bp}`, 2);
  if (!(await fs.isDir(config.packs.rp)))
    throw new ConfigError(`packs.rp missing: ${config.packs.rp}`, 2);
  if (!(await fs.isFile(resolve(config.packs.bp, "manifest.json")))) {
    throw new ConfigError(`packs.bp has no manifest.json: ${config.packs.bp}`, 2);
  }
  if (!(await fs.isFile(resolve(config.packs.rp, "manifest.json")))) {
    throw new ConfigError(`packs.rp has no manifest.json: ${config.packs.rp}`, 2);
  }
  if (!(await fs.isFile(config.entry))) throw new ConfigError(`entry missing: ${config.entry}`, 2);
  if (config.deploy.target === "custom" && !config.deploy.customPath?.trim()) {
    throw new ConfigError('deploy.target "custom" needs deploy.customPath.', 2);
  }
}
