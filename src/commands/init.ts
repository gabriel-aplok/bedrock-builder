import { spawn } from "node:child_process";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

import * as p from "@clack/prompts";
import pc from "picocolors";
import { logger, printJson } from "../logger.js";
import { AbortError } from "./create-prompts.js";
import { buildInitFiles } from "./init-files.js";

export interface InitOptions {
  // where to create. Defaults to ./<name>.
  dir?: string | undefined;
  // create into the current directory instead of a subdir.
  here?: boolean | undefined;
  // overwrite an existing non-empty directory.
  force?: boolean | undefined;
  // emit src/main.js instead of src/main.ts.
  js?: boolean | undefined;
  // run git init after createing. skips the prompt when set.
  git?: boolean | undefined;
  gitSet?: boolean | undefined;
  // run npm install after createing. skips the prompt when set.
  install?: boolean | undefined;
  installSet?: boolean | undefined;
  targetVersion?: string | undefined;
  json?: boolean | undefined;
}

export interface InitReport {
  command: "init";
  ok: boolean;
  dir: string;
  files: string[];
  git: boolean;
  installed: boolean;
}

export class InitError extends Error {
  readonly exitCode = 8;
  constructor(message: string) {
    super(message);
    this.name = "InitError";
  }
}

const NAME = /^[a-z0-9][a-z0-9_-]*$/;
const VERSION = /^\d+\.\d+\.\d+$/;

function parseName(raw: string): string {
  const name = raw.trim();
  if (name === "") {
    throw new InitError("A project name is required. Usage: bb init <name>");
  }
  if (!NAME.test(name)) {
    throw new InitError(
      `Project name must be lowercase letters, digits, dash, or underscore, got "${raw}".`,
    );
  }
  return name;
}

function parseVersion(raw: string | undefined, fallback: string): string {
  const value = (raw ?? fallback).trim();
  if (!VERSION.test(value)) {
    throw new InitError(`Version must be x.y.z, got "${value}".`);
  }
  return value;
}

// resolve the latest published range for a dep, offline-safe fallback.
async function latestRange(name: string, fallback: string): Promise<string> {
  if (!/^@[a-z0-9-~][a-z0-9-._~]*\/[a-z0-9-~][a-z0-9-._~]*$/.test(name)) {
    return fallback;
  }
  return new Promise((resolve) => {
    const child = spawn(`npm view ${name} version`, {
      shell: true,
      timeout: 10000,
    });
    let out = "";
    child.stdout?.on("data", (chunk: Buffer | string) => {
      out += String(chunk);
    });
    child.on("error", () => resolve(fallback));
    child.on("close", (code) => {
      if (code !== 0) {
        resolve(fallback);
        return;
      }
      const version = out.trim().split("\n").pop()?.trim();
      resolve(version !== undefined && /^\d+\.\d+\.\d+/.test(version) ? `^${version}` : fallback);
    });
  });
}

async function isEmpty(dir: string): Promise<boolean> {
  try {
    const entries = await readdir(dir);
    return entries.length === 0;
  } catch {
    return true;
  }
}

export async function init(rawName: string, options: InitOptions = {}): Promise<InitReport> {
  const interactive =
    Boolean(process.stdout.isTTY) && rawName.trim() === "" && !(options.json ?? false);
  let name = rawName;
  if (interactive) {
    try {
      p.intro(pc.bgCyan(pc.black(" bb init ")));
      name = await askName();
      options = {
        ...options,
        js: await askLanguage(),
        git: options.gitSet === true ? options.git : await askConfirm("Run git init?"),
        install:
          options.installSet === true
            ? options.install
            : await askConfirm("Run npm install?", false),
      };
    } catch (err) {
      if (err instanceof AbortError) {
        return {
          command: "init",
          ok: false,
          dir: process.cwd(),
          files: [],
          git: false,
          installed: false,
        };
      }
      throw err;
    }
  }
  const project = parseName(name);
  const targetVersion = parseVersion(options.targetVersion, "1.21.0");
  const cwd = process.cwd();
  const dir = options.here
    ? cwd
    : options.dir
      ? isAbsolute(options.dir)
        ? options.dir
        : resolve(cwd, options.dir)
      : resolve(cwd, project);

  if (!(options.force ?? false) && !(await isEmpty(dir))) {
    throw new InitError(
      `Target is not empty: ${dir}. Use --force to overwrite, or pick another name.`,
    );
  }

  const [serverRange, builderRange] = await Promise.all([
    latestRange("@minecraft/server", "^2.0.0"),
    latestRange("@aplok/bedrock-builder", "^1.0.0"),
  ]);

  const files = buildInitFiles({
    name: project,
    targetVersion,
    minEngineVersion: targetVersion,
    version: "1.0.0",
    js: options.js ?? false,
    serverRange,
    builderRange,
  });
  await mkdir(dir, { recursive: true });
  const spin = interactive ? p.spinner() : null;
  spin?.start("Createing project");
  for (const file of files) {
    const dest = join(dir, file.rel);
    await mkdir(join(dest, ".."), { recursive: true });
    if (file.base64 === true) {
      await writeFile(dest, Buffer.from(file.body, "base64"));
    } else {
      await writeFile(dest, file.body, "utf8");
    }
  }
  spin?.stop("Project createed");

  let git = false;
  if (options.git ?? true) {
    const gitSpin = interactive ? p.spinner() : null;
    gitSpin?.start("Running git init");
    git = await runGitInit(dir);
    if (interactive) gitSpin?.stop(git ? "Git ready" : "Git skipped");
  }
  let installed = false;
  if (options.install ?? false) {
    const npmSpin = interactive ? p.spinner() : null;
    npmSpin?.start("Running npm install");
    installed = (await runNpmInstall(dir)) === 0;
    if (interactive) npmSpin?.stop(installed ? "Dependencies installed" : "Install failed");
  }

  const report: InitReport = {
    command: "init",
    ok: true,
    dir,
    files: files.map((file) => file.rel),
    git,
    installed,
  };
  if (options.json ?? false) {
    printJson(report);
  } else if (interactive) {
    const shown = relative(cwd, dir) === "" ? "." : relative(cwd, dir);
    p.note(`cd ${shown}\nnpm install\nbb build\nbb run --watch`, "Next steps");
    p.outro(pc.green(`done: ${project} in ${dir}`));
  } else {
    logger.success(`Createed ${project} in ${dir}`);
    for (const file of report.files) logger.info(`  ${file}`);
    logger.info("Next: npm install, then bb build");
  }
  return report;
}

async function askName(): Promise<string> {
  const value = await p.text({
    message: "Project name",
    placeholder: "my-addon",
    validate: (text) => {
      const trimmed = (text ?? "").trim();
      if (!/^[a-z0-9][a-z0-9_-]*$/.test(trimmed)) {
        return "lowercase letters, digits, dash, or underscore";
      }
      return undefined;
    },
  });
  if (p.isCancel(value)) throw new AbortError();
  return (value as string).trim();
}

async function askLanguage(): Promise<boolean> {
  const value = await p.select({
    message: "Language",
    options: [
      { value: "ts", label: "TypeScript (recommended)" },
      { value: "js", label: "JavaScript" },
    ],
  });
  if (p.isCancel(value)) throw new AbortError();
  return value === "js";
}

async function askConfirm(message: string, initial = true): Promise<boolean> {
  const value = await p.confirm({ message, initialValue: initial });
  if (p.isCancel(value)) throw new AbortError();
  return value as boolean;
}

function runGitInit(dir: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("git init", { cwd: dir, shell: true });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

function runNpmInstall(dir: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn("npm install", { cwd: dir, shell: true });
    child.stdout?.pipe(process.stdout);
    child.stderr?.pipe(process.stderr);
    child.on("error", () => resolve(1));
    child.on("close", (code) => resolve(code ?? 1));
  });
}
