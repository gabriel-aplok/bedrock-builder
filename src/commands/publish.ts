import { runTool } from "../process.js";

import type { BedrockConfig } from "../config.js";
import { harnessCheck } from "../harness/check.js";
import { logger, printJson } from "../logger.js";
import { pack } from "./pack.js";
import { version } from "./version.js";

export interface PublishOptions {
  // bump first: patch, minor, major, or x.y.z. skipped when omitted.
  bump?: string | undefined;
  // create git tag v<version>.
  tag?: boolean | undefined;
  // git push plus push --tags.
  push?: boolean | undefined;
  dryRun?: boolean | undefined;
  typecheck?: boolean | undefined;
  json?: boolean | undefined;
}

export interface PublishReport {
  command: "publish";
  ok: boolean;
  version: string;
  output: string;
  bytes: number;
  harnessFiles: number;
  tagged: boolean;
  pushed: boolean;
  dryRun: boolean;
}

export class PublishError extends Error {
  readonly exitCode = 12;
  constructor(message: string) {
    super(message);
    this.name = "PublishError";
  }
}

function bumpVersion(current: string, bump: string): string {
  const trimmed = bump.trim();
  if (/^\d+\.\d+\.\d+$/.test(trimmed)) return trimmed;
  const parts = current.split(".").map(Number);
  const [major = 1, minor = 0, patch = 0] = parts;
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  if (bump === "patch") return `${major}.${minor}.${patch + 1}`;
  throw new PublishError(`Bump must be patch, minor, major, or x.y.z, got "${bump}".`);
}

function runGit(dir: string, args: string[]): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const child = runTool("git", args, { cwd: dir });
    let out = "";
    child.stdout?.on("data", (chunk: Buffer | string) => {
      out += String(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      out += String(chunk);
    });
    child.on("error", () => resolve({ ok: false, output: "git not found" }));
    child.on("close", (code) => resolve({ ok: code === 0, output: out.trim() }));
  });
}

// release flow: optional bump, then ship, harness, optional tag plus push.
export async function publish(
  config: BedrockConfig,
  options: PublishOptions = {},
): Promise<PublishReport> {
  const dryRun = options.dryRun ?? false;
  let versionNow = config.version;

  if (options.bump !== undefined) {
    versionNow = bumpVersion(config.version, options.bump);
    if (!dryRun) {
      await version(versionNow, { dir: config.__configDir });
      const { loadConfig } = await import("../config.js");
      config = await loadConfig(config.__configDir);
    }
  }

  const steps: string[] = [];
  steps.push(`ship ${config.name}-${versionNow}.mcaddon`);
  steps.push("harness check");
  if (options.tag ?? false) steps.push(`git tag v${versionNow}`);
  if (options.push ?? false) steps.push("git push plus tags");

  if (dryRun) {
    const report: PublishReport = {
      command: "publish",
      ok: true,
      version: versionNow,
      output: "",
      bytes: 0,
      harnessFiles: 0,
      tagged: false,
      pushed: false,
      dryRun: true,
    };
    if (options.json ?? false) printJson(report);
    else {
      logger.info("Publish plan, nothing runs:");
      for (const step of steps) logger.info(`  ${step}`);
    }
    return report;
  }

  const packed = await pack(config, { typecheck: options.typecheck ?? false });
  const checked = await harnessCheck(config.out);
  if (checked.failures.length > 0) {
    const lines = checked.failures
      .slice(0, 10)
      .map((f) => `  - ${f.message}`)
      .join("\n");
    throw new PublishError(`Harness found ${checked.failures.length} issue(s):\n${lines}`);
  }

  let tagged = false;
  if (options.tag ?? false) {
    const tag = await runGit(config.__configDir, ["tag", `v${versionNow}`]);
    if (!tag.ok) {
      throw new PublishError(`git tag failed: ${tag.output || "unknown error"}`);
    }
    tagged = true;
  }

  let pushed = false;
  if (options.push ?? false) {
    const push = await runGit(config.__configDir, ["push"]);
    if (!push.ok) {
      throw new PublishError(`git push failed: ${push.output || "unknown error"}`);
    }
    const tags = await runGit(config.__configDir, ["push", "--tags"]);
    if (!tags.ok) {
      throw new PublishError(`git push --tags failed: ${tags.output || "unknown error"}`);
    }
    pushed = true;
  }

  const report: PublishReport = {
    command: "publish",
    ok: true,
    version: versionNow,
    output: packed.output,
    bytes: packed.bytes,
    harnessFiles: checked.files,
    tagged,
    pushed,
    dryRun: false,
  };
  if (options.json ?? false) printJson(report);
  else {
    logger.success(
      `Published ${config.name}-${versionNow} (${packed.bytes} B, ${checked.files} files checked)`,
    );
    if (tagged) logger.info(`Tagged v${versionNow}`);
    if (pushed) logger.info("Pushed plus tags");
  }
  return report;
}
