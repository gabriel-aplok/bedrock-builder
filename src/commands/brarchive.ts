import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

import type { BedrockConfig } from "../config.js";
import { logger, printJson } from "../logger.js";
import { collectDir, writeZip } from "../pack/zip.js";
import { validatePackManifests } from "../pipeline/manifest.js";
import { isRecord } from "../records.js";
import { build } from "./build.js";
import { runTool } from "../process.js";

export interface BrarchiveOptions {
  output?: string | undefined;
  serverDir?: string | undefined;
  keepConfig?: boolean | undefined;
  json?: boolean | undefined;
  typecheck?: boolean | undefined;
}

export interface BrarchiveReport {
  command: "brarchive";
  ok: boolean;
  output: string;
  bytes: number;
  files: number;
  packMs: number;
}

export class BrarchiveError extends Error {
  readonly exitCode = 16;
  constructor(message: string) {
    super(message);
    this.name = "BrarchiveError";
  }
}

const CONFIG_NAME = "pack_optimizer_config.json";
const ENV_SERVER_DIR = "BEDROCK_SERVER_DIR";
const SERVER_EXE = "bedrock_server.exe";
const SETTLE_MS = 2000;
const ZIP_COMPRESSION = 6;
const BYTES_PER_MB = 1024 * 1024;
const SERVER_OUTPUT_MB = 64;
const SERVER_LOG_TAIL = 4000;

// find the server dir: flag, bb.serverDir, env, then a local bedrock_server folder.
export async function resolveServerDir(
  config: BedrockConfig,
  flag: string | undefined,
): Promise<string> {
  const candidates: string[] = [];
  if (flag !== undefined && flag !== "") {
    candidates.push(isAbsolute(flag) ? flag : join(config.__configDir, flag));
  }
  if (config.serverDir !== null) candidates.push(config.serverDir);
  const env = process.env[ENV_SERVER_DIR];
  if (env !== undefined && env !== "") candidates.push(env);
  candidates.push(join(config.__configDir, "bedrock_server"));
  for (const candidate of candidates) {
    try {
      await stat(join(candidate, SERVER_EXE));
      return candidate;
    } catch {
      // try the next candidate.
    }
  }
  throw new BrarchiveError(
    `No ${SERVER_EXE} found. Pass --server-dir, set bb.serverDir in config.json, or set ${ENV_SERVER_DIR}.`,
  );
}

// compile dist packs through the dedicated server optimizer, then zip
// the result. the server only runs on windows.
export async function brarchive(
  config: BedrockConfig,
  options: BrarchiveOptions = {},
): Promise<BrarchiveReport> {
  if (process.platform !== "win32") {
    throw new BrarchiveError("brarchive needs the windows dedicated server.");
  }
  await build(config, {
    release: true,
    clean: false,
    typecheck: options.typecheck ?? false,
  });

  const bpDir = join(config.out, "packs", "BP");
  const rpDir = join(config.out, "packs", "RP");
  const findings = await validatePackManifests(bpDir, rpDir);
  if (findings.length > 0) {
    const lines = findings.map((entry) => `  - ${entry.message}`).join("\n");
    if (options.json ?? false) {
      printJson({
        command: "brarchive",
        ok: false,
        failures: findings.map((entry) => entry.message),
      });
    }
    throw new BrarchiveError(`Pack checks failed:\n${lines}`);
  }

  const serverDir = await resolveServerDir(config, options.serverDir);
  const compiled = await mkdtemp(join(tmpdir(), "bb-brarchive-"));
  const configPath = join(config.__configDir, CONFIG_NAME);
  try {
    await writeFile(
      configPath,
      `${JSON.stringify({ input_directory: join(config.out, "packs"), output_directory: compiled, verbose_logging: true }, null, 2)}\n`,
      "utf8",
    );
    await runOptimizer(serverDir, configPath);
    const packs = await validPackDirs(compiled);
    if (packs.length === 0) {
      throw new BrarchiveError(`Server wrote no valid packs to ${compiled}.`);
    }
    const target = resolveOutput(config, options.output, packs);
    await mkdir(dirname(target), { recursive: true });
    logger.info(`Packing ${target}...`);
    const started = Date.now();
    const entries = (
      await Promise.all(packs.map((compiled) => collectDir(compiled.path, compiled.prefix)))
    ).flat();
    // a lone resource pack zips at the archive root, like a plain .mcpack.
    const rooted =
      packs.length === 1 && packs[0]!.kind === "RP"
        ? entries
            .map((entry) => ({ ...entry, name: entry.name.replace(/^RP\//, "") }))
            .filter((entry) => entry.name !== "")
        : entries;
    const zipped = await writeZip(target, rooted, ZIP_COMPRESSION);
    const bytes = (await stat(target)).size;
    const report: BrarchiveReport = {
      command: "brarchive",
      ok: true,
      output: target,
      bytes,
      files: zipped.files,
      packMs: Date.now() - started,
    };
    logger.success(`Compiled ${target} (${zipped.files} files in ${report.packMs}ms)`);
    if (options.json ?? false) printJson(report);
    return report;
  } finally {
    await rm(compiled, { recursive: true, force: true });
    if (!(options.keepConfig ?? false)) await rm(configPath, { force: true });
  }
}

function runOptimizer(serverDir: string, configPath: string): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = runTool(join(serverDir, SERVER_EXE), [`PackOptimizerConfigPath=${configPath}`], {
      cwd: serverDir,
      maxBuffer: SERVER_OUTPUT_MB * BYTES_PER_MB,
    });
    // keep the log for failures only. stdout stays clean for --json.
    const chunks: Buffer[] = [];
    child.stdout?.on("data", (chunk: unknown) => {
      chunks.push(Buffer.from(chunk as Uint8Array));
    });
    child.stderr?.on("data", (chunk: unknown) => {
      chunks.push(Buffer.from(chunk as Uint8Array));
    });
    child.on("error", (err) => {
      rejectPromise(new BrarchiveError(`Cannot start ${SERVER_EXE}: ${err.message}`));
    });
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else {
        const tail = Buffer.concat(chunks).toString("utf8").slice(-SERVER_LOG_TAIL).trim();
        if (tail !== "") process.stderr.write(`${tail}\n`);
        rejectPromise(new BrarchiveError(`${SERVER_EXE} exited with code ${code}.`));
      }
    });
  });
}

export interface CompiledPack {
  kind: "BP" | "RP";
  path: string;
  prefix: string;
}

async function validPackDirs(dir: string): Promise<CompiledPack[]> {
  // the server may take a moment to flush output after exit.
  await new Promise((resolvePromise) => setTimeout(resolvePromise, SETTLE_MS));
  const out: CompiledPack[] = [];
  for (const [kind, moduleType] of [
    ["BP", "data"],
    ["RP", "resources"],
  ] as const) {
    const path = join(dir, kind);
    try {
      const manifest: unknown = JSON.parse(await readFile(join(path, "manifest.json"), "utf8"));
      if (!isRecord(manifest)) continue;
      const modules = manifest.modules;
      if (!Array.isArray(modules)) continue;
      const match = modules.some((mod) => isRecord(mod) && mod.type === moduleType);
      if (!match) continue;
      out.push({ kind, path, prefix: kind });
    } catch {
      // missing or unreadable manifest, skip this pack.
    }
  }
  return out;
}

export function resolveOutput(
  config: BedrockConfig,
  raw: string | undefined,
  packs: CompiledPack[],
): string {
  const kinds = packs.map((compiled) => compiled.kind);
  const ext = kinds.includes("BP") && kinds.includes("RP") ? ".mcaddon" : ".mcpack";
  const fallback = join(config.out, `${config.name}-${config.version}${ext}`);
  if (raw === undefined || raw === "") return fallback;
  const abs = isAbsolute(raw) ? raw : resolve(config.__configDir, raw);
  const base = abs.endsWith(".mcaddon")
    ? abs.slice(0, -".mcaddon".length)
    : abs.endsWith(".mcpack")
      ? abs.slice(0, -".mcpack".length)
      : abs;
  return `${base}${ext}`;
}
