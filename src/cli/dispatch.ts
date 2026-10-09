import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { BundlerError } from "../bundler.js";
import { build } from "../commands/build.js";
import { clean } from "../commands/clean.js";
import { create } from "../commands/create.js";
import { deploy } from "../commands/deploy.js";
import { diff } from "../commands/diff.js";
import { doctor } from "../commands/doctor.js";
import { extensions } from "../commands/extensions.js";
import { folders } from "../commands/folders.js";
import { harness, HarnessError } from "../commands/harness.js";
import { init, InitError } from "../commands/init.js";
import { manifest, ManifestError } from "../commands/manifest.js";
import { pack, PackError } from "../commands/pack.js";
import { publish, PublishError } from "../commands/publish.js";
import { version as bumpVersion, VersionError } from "../commands/version.js";
import { watch } from "../commands/watch.js";
import { ConfigError, loadConfig, loadConfigLenient } from "../config.js";
import { GenerateError } from "../generate/core/errors.js";
import { isJson, logger, printJson } from "../logger.js";
import { DeployTargetError } from "../paths.js";
import { TypecheckError } from "../typecheck.js";
import { toCreateFlags, type CliArgs } from "./args.js";
import { showHelp } from "./help.js";

async function packageVersion(): Promise<string> {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const file of [
    resolve(here, "..", "package.json"),
    resolve(here, "..", "..", "package.json"),
  ]) {
    try {
      const parsed = JSON.parse(await readFile(file, "utf8")) as {
        name?: string;
        version?: string;
      };
      if (parsed.name === "@aplok/bedrock-builder" && typeof parsed.version === "string") {
        return parsed.version;
      }
    } catch {}
  }
  return "0.0.0";
}

function asNumber(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function fail(text: string): number {
  logger.error(text);
  showHelp();
  return 1;
}

export async function dispatch(args: CliArgs): Promise<number> {
  if (args.version) {
    process.stdout.write(`${await packageVersion()}\n`);
    return 0;
  }
  if (args.help && args.command === null) {
    showHelp();
    return 0;
  }
  if (args.unknown.length > 0) return fail(`Unknown option(s): ${args.unknown.join(", ")}`);
  if (args.command === null) {
    if (args.extraPositionals.length > 0)
      return fail(`Unknown command: ${args.extraPositionals[0]}`);
    showHelp();
    return 1;
  }
  if (args.extraPositionals.length > 0) {
    return fail(
      `Unexpected positional argument(s) for \`${args.command}\`: ${args.extraPositionals.join(", ")}`,
    );
  }
  if (args.help) {
    showHelp();
    return 0;
  }

  // init and manifest run before any config is loaded.
  // init creates a project, manifest fixes an existing one.
  if (args.command === "init") {
    try {
      await init(args.initName ?? "", {
        dir: args.dir,
        here: args.here,
        force: args.force,
        js: args.js,
        git: args.git,
        gitSet: args.gitSet,
        install: args.install,
        installSet: args.installSet,
        targetVersion: args.targetVersion,
        json: args.json,
      });
      return 0;
    } catch (err) {
      if (err instanceof InitError) return report(err.message, err.exitCode);
      return report(err instanceof Error ? err.message : String(err), 1);
    }
  }

  // init, version, and manifest run before any config is loaded.
  // check --fix loads leniently, so it can repair broken projects.
  if (args.command === "version") {
    try {
      await bumpVersion(args.genVersion ?? "", {
        dir: args.configPath ?? args.dir,
        dryRun: args.dryRun,
        json: args.json,
      });
      return 0;
    } catch (err) {
      if (err instanceof VersionError) return report(err.message, err.exitCode);
      return report(err instanceof Error ? err.message : String(err), 1);
    }
  }

  if (args.command === "manifest") {
    try {
      await manifest({
        name: args.name,
        version: args.packVersion,
        dryRun: args.dryRun,
        dir: args.dir,
        json: args.json,
      });
      return 0;
    } catch (err) {
      if (err instanceof ManifestError) return report(err.message, err.exitCode);
      return report(err instanceof Error ? err.message : String(err), 1);
    }
  }

  // new --list needs no project. print types and exit before config load.
  if (args.command === "new" && args.list) {
    const { CREATE_TYPES } = await import("../generate/core/types.js");
    process.stdout.write(`Generator types (${CREATE_TYPES.length}):\n`);
    for (const type of CREATE_TYPES) process.stdout.write(`  ${type}\n`);
    return 0;
  }

  let config;
  try {
    config =
      args.command === "check" && args.fix
        ? await loadConfigLenient(args.configPath)
        : await loadConfig(args.configPath);
  } catch (err) {
    if (err instanceof ConfigError) {
      logger.error(err.message);
      return err.exitCode;
    }
    logger.error(err instanceof Error ? err.message : String(err));
    return 1;
  }

  if (args.command === "harness") {
    try {
      await harness(config, {
        build: !args.noBuild,
        strict: args.strict,
        json: args.json,
      });
      return 0;
    } catch (err) {
      if (err instanceof HarnessError) return report(err.message, err.exitCode);
      return report(err instanceof Error ? err.message : String(err), 1);
    }
  }

  try {
    switch (args.command) {
      case "build":
        await build(config, {
          release: args.release,
          clean: args.clean,
          json: args.json,
          typecheck: args.typecheck,
          stats: args.stats,
        });
        return 0;
      case "watch":
        await watch(config, { types: !args.noTypes });
        return 0;
      case "run":
        await deploy(config, {
          release: args.release,
          watch: args.watch,
          types: !args.noTypes,
        });
        return 0;
      case "publish":
        await publish(config, {
          bump: args.bump,
          tag: args.tag,
          push: args.push,
          dryRun: args.dryRun,
          typecheck: args.typecheck,
          json: args.json,
        });
        return 0;
      case "ship":
        await pack(config, {
          ...(args.output ? { output: args.output } : {}),
          ...(args.level !== undefined ? { level: asNumber(args.level) } : {}),
          json: args.json,
          typecheck: args.typecheck,
        });
        return 0;
      case "clean":
        await clean(config, { json: args.json });
        return 0;
      case "diff":
        await diff(config, { json: args.json });
        return 0;
      case "folders":
        await folders(config);
        return 0;
      case "ext":
        await extensions(config, { install: args.install, json: args.json });
        return 0;
      case "check": {
        const report = await doctor(config, { json: args.json, fix: args.fix });
        return report.ok ? 0 : 1;
      }
      case "new": {
        const flags = toCreateFlags(args);
        await create(config, {
          type: flags.type,
          name: flags.name,
          icon: flags.icon,
          geometry: flags.geometry,
          texture: flags.texture,
          mode: flags.mode,
          piece: flags.piece,
          tier: flags.tier,
          variant: flags.variant,
          sound: flags.sound,
          renderMethod: flags.renderMethod,
          displayName: flags.displayName,
          repairItem: flags.repairItem,
          light: asNumber(flags.light),
          durability: asNumber(flags.durability),
          damage: asNumber(flags.damage),
          protection: asNumber(flags.protection),
          enchantValue: asNumber(flags.enchantValue),
          rolls: asNumber(flags.rolls),
          count: asNumber(flags.count),
          min: asNumber(flags.min),
          max: asNumber(flags.max),
          recipeKind: flags.recipeKind,
          pattern: flags.pattern,
          recipeKey: flags.recipeKey,
          result: flags.result,
          ingredients: flags.ingredients,
          lootKind: flags.lootKind,
          recipe: flags.recipe,
          loot: flags.loot,
          spawnCategory: flags.spawnCategory,
          weight: asNumber(flags.weight),
          want: flags.want,
          give: flags.give,
          dialogueText: flags.dialogueText,
          dialogueButton: flags.dialogueButton,
          animation: flags.animation,
          equipment: flags.equipment,
          color: flags.color,
          fog: flags.fog,
          x: asNumber(flags.x),
          y: asNumber(flags.y),
          z: asNumber(flags.z),
          category: flags.category,
          group: flags.group,
          commandLine: flags.commandLine,
          soundFile: flags.soundFile,
          direction: flags.direction,
          force: flags.force,
          dryRun: flags.dryRun,
          yes: flags.yes,
        });
        return 0;
      }
    }
  } catch (err) {
    if (err instanceof TypecheckError) {
      if (isJson()) {
        printJson({
          ok: false,
          error: err.message,
          code: err.exitCode,
          diagnostics: err.diagnostics,
        });
      } else {
        for (const d of err.diagnostics) {
          logger.error(`${d.file}:${d.line}:${d.column} ${d.code} ${d.message}`);
        }
        logger.error(err.message);
      }
      return err.exitCode;
    }
    if (err instanceof ConfigError) {
      return report(err.message, err.exitCode);
    }
    if (err instanceof DeployTargetError) {
      return report(err.message, err.exitCode);
    }
    if (err instanceof GenerateError) {
      return report(err.message, err.exitCode);
    }
    if (err instanceof PackError) {
      return report(err.message, err.exitCode);
    }
    if (err instanceof PublishError) {
      return report(err.message, err.exitCode);
    }
    if (err instanceof BundlerError) {
      return report(err.message, err.exitCode);
    }
    return report(err instanceof Error ? err.message : String(err), 1);
  }
}

// one place for the error to text or json mapping.
function report(message: string, code: number): number {
  if (isJson()) printJson({ ok: false, error: message, code });
  else logger.error(message);
  return code;
}
