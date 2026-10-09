import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { logger, printJson } from "../logger.js";
import { detectPackLayout, rewriteManifests, type ManifestTarget } from "../manifest/rewrite.js";

export interface ManifestOptions {
  // override the project name baked into header.name.
  name?: string | undefined;
  // bump header and module versions to this.
  version?: string | undefined;
  // print the plan, write nothing.
  dryRun?: boolean | undefined;
  // root to scan. Defaults to cwd.
  dir?: string | undefined;
  json?: boolean | undefined;
}

export interface ManifestReport {
  command: "manifest";
  ok: boolean;
  root: string;
  targets: { kind: "BP" | "RP"; path: string }[];
  changes: string[];
  dryRun: boolean;
}

export class ManifestError extends Error {
  readonly exitCode = 9;
  constructor(message: string) {
    super(message);
    this.name = "ManifestError";
  }
}

// fall back to the directory name when no name is given.
function deriveName(raw: string | undefined, root: string): string {
  const trimmed = (raw ?? "").trim();
  if (trimmed !== "") return trimmed;
  const base = resolve(root).split(/[\\/]/).filter(Boolean).pop() ?? "addon";
  return base;
}

export async function manifest(options: ManifestOptions = {}): Promise<ManifestReport> {
  const root = resolve(options.dir ?? process.cwd());
  const targets: ManifestTarget[] = await detectPackLayout(root);
  if (targets.length === 0) {
    throw new ManifestError(
      `No pack manifests found under ${root}. Looked for packs/BP, BP/, and behavior_packs/.`,
    );
  }

  const name = deriveName(options.name, root);
  const report = await rewriteManifests(targets, {
    name,
    version: options.version,
  });

  if (!(options.dryRun ?? false)) {
    for (const target of report.targets) {
      await writeFile(target.path, target.content, "utf8");
    }
  }

  const result: ManifestReport = {
    command: "manifest",
    ok: true,
    root,
    targets: report.targets.map((t) => ({ kind: t.kind, path: t.path })),
    changes: report.changes,
    dryRun: options.dryRun ?? false,
  };

  if (options.json ?? false) {
    printJson(result);
  } else {
    for (const target of result.targets) {
      logger.info(`${target.kind} ${target.path}`);
    }
    for (const change of result.changes) logger.debug(change);
    logger.success(
      (options.dryRun ?? false)
        ? `Would rewrite ${result.targets.length} manifest(s), nothing written`
        : `Rewrote ${result.targets.length} manifest(s) with fresh uuids`,
    );
  }
  return result;
}
