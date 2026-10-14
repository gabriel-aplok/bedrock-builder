import { isRecord } from "../records.js";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { logger, printJson } from "../logger.js";
import { deriveNamespace } from "../generate/core/identifier.js";
import { packageVersion } from "../package-info.js";
import { manifestVersion } from "../pipeline/manifest.js";
import { detectPackLayout } from "../manifest/rewrite.js";
import { latestRange } from "./init.js";

export interface ImportOptions {
  dir?: string | undefined;
  force?: boolean | undefined;
  dryRun?: boolean | undefined;
  json?: boolean | undefined;
}

export interface ImportReport {
  command: "import";
  ok: boolean;
  dir: string;
  files: string[];
  dryRun: boolean;
}

export class ImportError extends Error {
  readonly exitCode = 15;
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}

async function readJson(path: string): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// adopt an existing pack folder into a bb project, writing only missing files.
export async function importProject(
  rawDir: string | undefined,
  options: ImportOptions = {},
): Promise<ImportReport> {
  const dir = rawDir?.trim() ? resolve(process.cwd(), rawDir.trim()) : process.cwd();
  const targets = await detectPackLayout(dir);
  const bp = targets.find((target) => target.kind === "BP");
  const rp = targets.find((target) => target.kind === "RP");
  if (!bp || !rp) {
    throw new ImportError(`No BP plus RP manifests found under ${dir}.`);
  }

  const bpManifest = await readJson(bp.path);
  const bpHeader = bpManifest?.header;
  const existing = await readJson(join(dir, "config.json"));

  const dirName = dir.split(/[\\/]/).pop() ?? "addon";
  const headerName = isRecord(bpHeader) && typeof bpHeader.name === "string" ? bpHeader.name : "";
  const baseName =
    typeof existing?.name === "string" && existing.name.trim() !== ""
      ? existing.name.trim()
      : headerName !== ""
        ? headerName
        : dirName;
  const name = baseName.trim() === "" ? "addon" : baseName;
  const namespace =
    typeof existing?.namespace === "string" && existing.namespace.trim() !== ""
      ? existing.namespace.trim()
      : deriveNamespace(name);
  const targetVersion =
    typeof existing?.targetVersion === "string" && existing.targetVersion.trim() !== ""
      ? existing.targetVersion.trim()
      : "1.21.0";
  const version = manifestVersion(isRecord(bpHeader) ? bpHeader.version : undefined) ?? "1.0.0";

  const rel = (abs: string): string => relative(dir, abs).replace(/\\/g, "/") || ".";
  const bpRel = rel(join(bp.path, ".."));
  const rpRel = rel(join(rp.path, ".."));

  const entry = await findEntry(dir);
  const config = {
    type: "minecraftBedrock",
    name,
    authors: Array.isArray(existing?.authors) ? existing.authors : [],
    targetVersion,
    ...(typeof existing?.description === "string" ? { description: existing.description } : {}),
    namespace,
    packs: { behaviorPack: bpRel, resourcePack: rpRel },
    worlds: Array.isArray(existing?.worlds) ? existing.worlds : [],
    bb: {
      version,
      ...(entry === null ? {} : { entry }),
      out: "dist",
      deploy: { target: "retail", customPath: null },
    },
  };

  const pkg = await readJson(join(dir, "package.json"));
  const files: { rel: string; body: string }[] = [];
  if (existing === null) {
    files.push({ rel: "config.json", body: `${JSON.stringify(config, null, 2)}\n` });
  } else if (options.force ?? false) {
    files.push({
      rel: "config.json",
      body: `${JSON.stringify({ ...existing, ...config }, null, 2)}\n`,
    });
  }
  if (pkg === null) {
    const builderRange = await latestRange("@aplok/bedrock-builder", `^${await packageVersion()}`);
    const slug =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "addon";
    files.push({
      rel: "package.json",
      body: `${JSON.stringify(
        {
          name: slug,
          version,
          private: true,
          type: "module",
          scripts: {
            build: "bb build",
            watch: "bb watch",
            run: "bb run",
            "run:watch": "bb run --watch",
            ship: "bb ship",
            clean: "bb clean",
            check: "bb check",
          },
          devDependencies: { "@aplok/bedrock-builder": builderRange },
        },
        null,
        2,
      )}\n`,
    });
  }

  const dryRun = options.dryRun ?? false;
  const written: string[] = [];
  for (const file of files) {
    if (dryRun) {
      written.push(file.rel);
      continue;
    }
    await writeFile(join(dir, file.rel), file.body, "utf8");
    written.push(file.rel);
  }

  const report: ImportReport = { command: "import", ok: true, dir, files: written, dryRun };
  if (options.json ?? false) {
    printJson(report);
  } else if (dryRun) {
    logger.info("Dry run, nothing will be written:");
    for (const file of written) logger.info(`  create ${file}`);
  } else if (written.length === 0) {
    logger.success(`Already a bb project: ${dir}`);
  } else {
    logger.success(`Imported ${name} in ${dir}`);
    for (const file of written) logger.info(`  create ${file}`);
    logger.info("Next: npm install, then bb check");
  }
  return report;
}

async function findEntry(dir: string): Promise<string | null> {
  const candidates = [
    "src/main.ts",
    "src/main.js",
    "scripts/main.ts",
    "scripts/main.js",
    "BP/scripts/main.ts",
    "BP/scripts/main.js",
  ];
  for (const candidate of candidates) {
    try {
      if ((await stat(join(dir, candidate))).isFile()) return candidate;
    } catch {}
  }
  return null;
}
