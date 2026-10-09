import { mkdir, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

import type { BedrockConfig } from "../config.js";
import { logger, printJson } from "../logger.js";
import { validatePackManifests } from "../pipeline/manifest.js";
import { build } from "./build.js";
import { collectDir, writeZip } from "../pack/zip.js";

export interface PackOptions {
  output?: string | undefined;
  level?: number | undefined;
  json?: boolean | undefined;
  typecheck?: boolean | undefined;
}

export interface PackReport {
  command: "ship";
  ok: boolean;
  output: string;
  bytes: number;
  files: number;
  packMs: number;
  compression: number;
}

export class PackError extends Error {
  readonly exitCode = 4;
  constructor(message: string) {
    super(message);
    this.name = "PackError";
  }
}

export { validatePackManifests } from "../pipeline/manifest.js";
export type { ManifestFinding } from "../pipeline/manifest.js";

const KB = 1024;
const MB = KB * 1024;
const DEFAULT_COMPRESSION = 6;
const STORE_ONLY = 0;
const MAX_COMPRESSION = 9;

function compressionLevel(raw: number | undefined): number {
  if (raw === undefined) return DEFAULT_COMPRESSION;
  if (!Number.isInteger(raw)) return DEFAULT_COMPRESSION;
  return Math.min(MAX_COMPRESSION, Math.max(STORE_ONLY, raw));
}

function prettySize(bytes: number): string {
  if (bytes < KB) return `${bytes} B`;
  if (bytes < MB) return `${(bytes / KB).toFixed(2)} KB`;
  return `${(bytes / MB).toFixed(2)} MB`;
}

export async function pack(config: BedrockConfig, options: PackOptions = {}): Promise<PackReport> {
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
        command: "ship",
        ok: false,
        failures: findings.map((entry) => entry.message),
      });
    }
    throw new PackError(`Pack checks failed:\n${lines}`);
  }

  const fallback = join(config.out, `${config.name}-${config.version}.mcaddon`);
  const target = options.output
    ? isAbsolute(options.output)
      ? options.output
      : resolve(config.__configDir, options.output)
    : fallback;
  await mkdir(dirname(target), { recursive: true });

  logger.info(`Packing ${config.name}-${config.version}.mcaddon...`);
  const started = Date.now();
  const level = compressionLevel(options.level);
  const zipped = await zipDirs(
    target,
    join(config.out, "packs", "BP"),
    join(config.out, "packs", "RP"),
    config.name,
    level,
  );

  const size = (await stat(target)).size;
  const packMs = Date.now() - started;
  if (!(process.env.CI === "true") && (process.stdout.isTTY ?? false)) {
    process.stdout.write("\r");
  }
  logger.success(`Packed ${target} (${prettySize(size)}, ${zipped.files} files in ${packMs}ms)`);
  const report: PackReport = {
    command: "ship",
    ok: true,
    output: target,
    bytes: size,
    files: zipped.files,
    packMs,
    compression: level,
  };
  if (options.json ?? false) printJson(report);
  return report;
}

async function zipDirs(
  output: string,
  bp: string,
  rp: string,
  name: string,
  compression: number,
): Promise<{ files: number }> {
  const quiet = process.env.CI === "true" || !(process.stdout.isTTY ?? false);
  let shown = 0;
  const entries = [
    ...(await collectDir(bp, `${name}_BP`)),
    ...(await collectDir(rp, `${name}_RP`)),
  ];
  try {
    const result = await writeZip(output, entries, compression, ({ files }) => {
      if (!quiet && files - shown >= 50) {
        shown = files;
        process.stdout.write(`\rPacking... ${files} files`);
      }
    });
    return { files: result.files };
  } catch (err) {
    throw new PackError(
      `Cannot write archive: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
