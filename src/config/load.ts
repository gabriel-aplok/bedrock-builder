import { readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

import type { BedrockConfig, Draft } from "./schema.js";
import { ConfigError, fillDefaults, isObj, nonEmpty, toDraft, validateConfig } from "./schema.js";

async function isDir(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function pickVersion(hint: unknown, base: string): Promise<string> {
  if (nonEmpty(hint)) return hint;
  try {
    const pkg = JSON.parse(await readFile(resolve(base, "package.json"), "utf8")) as {
      version?: unknown;
    };
    if (nonEmpty(pkg.version)) return pkg.version;
  } catch {}
  return "0.0.0";
}

async function pickEntry(hint: unknown, base: string): Promise<string> {
  if (nonEmpty(hint)) return hint;
  const ts = resolve(base, "src", "main.ts");
  if (await isFile(ts)) return ts;
  const js = resolve(base, "src", "main.js");
  if (await isFile(js)) return js;
  return ts;
}

async function claimsBedrock(file: string): Promise<boolean> {
  try {
    const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
    if (!isObj(parsed)) return false;
    if (parsed.type === "minecraftBedrock" || "bb" in parsed) return true;
    if (isObj(parsed.packs)) {
      const k = parsed.packs;
      if ("behaviorPack" in k || "resourcePack" in k || "bp" in k || "rp" in k) return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function locate(path?: string): Promise<string> {
  if (path) return isAbsolute(path) ? path : resolve(process.cwd(), path);
  const cwd = process.cwd();
  const next = resolve(cwd, "config.json");
  const prev = resolve(cwd, "bedrock.config.json");
  const hasNext = await isFile(next);
  const hasPrev = await isFile(prev);
  if (hasNext && hasPrev) return (await claimsBedrock(next)) ? next : prev;
  if (hasNext) return next;
  if (hasPrev) return prev;
  return next;
}

async function parseFile(file: string): Promise<Record<string, unknown>> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (err) {
    throw new ConfigError(
      `Cannot read ${file}: ${err instanceof Error ? err.message : String(err)}`,
      1,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new ConfigError(
      `Bad JSON in ${file}: ${err instanceof Error ? err.message : String(err)}`,
      2,
    );
  }
  if (!isObj(parsed)) throw new ConfigError(`Config ${file} must be a JSON object.`, 2);
  return parsed;
}

export async function loadConfig(path?: string): Promise<BedrockConfig> {
  const file = await locate(path);
  const base = dirname(file);
  const draft: Draft = toDraft(await parseFile(file));
  draft.version = await pickVersion(draft.version, base);
  draft.entry = await pickEntry(draft.entry, base);
  const config = fillDefaults(draft, base);
  await validateConfig(config, { isDir, isFile });
  return config;
}

// load without the disk validation, for check --fix on broken projects.
export async function loadConfigLenient(path?: string): Promise<BedrockConfig> {
  const file = await locate(path);
  const base = dirname(file);
  const draft: Draft = toDraft(await parseFile(file));
  draft.version = await pickVersion(draft.version, base);
  const entry = draft.entry;
  if (typeof entry === "string" && entry.trim() !== "") {
    draft.entry = entry;
  } else {
    draft.entry = "src/main.ts";
  }
  return fillDefaults(draft, base);
}
