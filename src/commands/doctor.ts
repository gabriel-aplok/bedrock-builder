import { randomUUID } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import * as p from "@clack/prompts";
import pc from "picocolors";
import type { BedrockConfig } from "../config.js";
import { logger, printJson } from "../logger.js";
import { resolveDeployTarget } from "../paths.js";
import { inspectExtensions } from "../pipeline/loader.js";

export interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
  fix: string | null;
  fixed: boolean;
}

export interface DoctorReport {
  command: "check";
  ok: boolean;
  fixed: number;
  checks: DoctorCheck[];
}

export interface DoctorOptions {
  json?: boolean | undefined;
  fix?: boolean | undefined;
}

async function present(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function presentDir(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

function check(name: string, ok: boolean, detail: string, fix: string | null = null): DoctorCheck {
  return { name, ok, detail, fix, fixed: false };
}

function manifestStub(kind: "BP" | "RP", name: string, version: string): string {
  const parts = version.split(".").map(Number);
  const triple = [parts[0] ?? 1, parts[1] ?? 0, parts[2] ?? 0];
  const modules =
    kind === "BP"
      ? [
          { type: "data", uuid: randomUUID(), version: triple },
          {
            type: "script",
            language: "javascript",
            entry: "scripts/main.js",
            uuid: randomUUID(),
            version: triple,
          },
        ]
      : [{ type: "resources", uuid: randomUUID(), version: triple }];
  return `${JSON.stringify(
    {
      format_version: 2,
      header: {
        description: `${name} ${kind}`,
        name: `${name} ${kind}`,
        uuid: randomUUID(),
        min_engine_version: [1, 21, 0],
        version: triple,
      },
      modules,
    },
    null,
    2,
  )}\n`;
}

export async function doctor(
  config: BedrockConfig,
  options: DoctorOptions = {},
): Promise<DoctorReport> {
  const interactive = Boolean(process.stdout.isTTY) && !(options.json ?? false);
  const fixSpin = interactive && (options.fix ?? false) ? p.spinner() : null;
  fixSpin?.start("Applying fixes");
  let fixed = 0;
  if (options.fix ?? false) {
    fixed = await applyFixes(config);
  }
  if (fixSpin) {
    fixSpin.stop(fixed > 0 ? `Fixed ${fixed} item(s)` : "Nothing to fix");
  }

  const checks: DoctorCheck[] = [
    check("config", true, `${config.name}@${config.version}`),
    check(
      "behavior-pack",
      await presentDir(config.packs.bp),
      config.packs.bp,
      `Create the dir or fix packs.behaviorPack in config.json.`,
    ),
    check(
      "resource-pack",
      await presentDir(config.packs.rp),
      config.packs.rp,
      `Create the dir or fix packs.resourcePack in config.json.`,
    ),
    check(
      "bp-manifest",
      await present(join(config.packs.bp, "manifest.json")),
      join(config.packs.bp, "manifest.json"),
      `Add packs/BP/manifest.json with header name, uuid, version.`,
    ),
    check(
      "rp-manifest",
      await present(join(config.packs.rp, "manifest.json")),
      join(config.packs.rp, "manifest.json"),
      `Add packs/RP/manifest.json with header name, uuid, version.`,
    ),
    check(
      "entry",
      await present(config.entry),
      config.entry,
      `Create the file or fix bb.entry in config.json.`,
    ),
  ];

  const extensionRows = await inspectExtensions(config);
  for (const row of extensionRows) {
    for (const extensionCheck of row.checks ?? []) {
      checks.push(
        check(
          extensionCheck.name,
          extensionCheck.ok,
          extensionCheck.detail,
          extensionCheck.fix ?? null,
        ),
      );
    }
  }

  try {
    const targets = await resolveDeployTarget(config);
    checks.push(check("deploy", true, targets.root));
  } catch (err) {
    const message = err instanceof Error ? err.message.split("\n")[0]! : String(err);
    const fix =
      config.deploy.target === "custom"
        ? `Set bb.deploy.customPath to your com.mojang dir.`
        : `Install the mcpelauncher or switch to deploy.target custom with a com.mojang path.`;
    checks.push(check("deploy", false, message, fix));
  }

  const report: DoctorReport = {
    command: "check",
    ok: checks.every((entry) => entry.ok),
    fixed,
    checks,
  };
  if (options.json ?? false) {
    printJson(report);
  } else {
    for (const entry of checks) {
      const mark = entry.ok ? "ok" : "fail";
      const hint = !entry.ok && entry.fix ? ` fix: ${entry.fix}` : "";
      logger.info(`check ${mark}: ${entry.name} (${entry.detail})${hint}`);
    }
    if (fixed > 0) {
      if (interactive) {
        p.note("Rerun bb check to verify", "Next step");
        p.outro(pc.green(`fixed ${fixed} item(s)`));
      } else {
        logger.success(`Fixed ${fixed} item(s), rerun check to verify`);
      }
    }
  }
  return report;
}

// create what can be created: pack dirs, stub manifests, stub entry.
// never touch config or the deploy target.
async function applyFixes(config: BedrockConfig): Promise<number> {
  let fixed = 0;

  for (const dir of [config.packs.bp, config.packs.rp]) {
    if (!(await presentDir(dir))) {
      await mkdir(dir, { recursive: true });
      fixed++;
    }
  }

  const stubs: { path: string; kind: "BP" | "RP" }[] = [
    { path: join(config.packs.bp, "manifest.json"), kind: "BP" },
    { path: join(config.packs.rp, "manifest.json"), kind: "RP" },
  ];
  for (const stub of stubs) {
    if (!(await present(stub.path))) {
      await writeFile(stub.path, manifestStub(stub.kind, config.name, config.version), "utf8");
      fixed++;
    }
  }

  if (!(await present(config.entry))) {
    await mkdir(dirname(config.entry), { recursive: true });
    await writeFile(config.entry, 'console.log("hello");\n', "utf8");
    fixed++;
  }

  return fixed;
}
