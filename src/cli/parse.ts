import { blankArgs, COMMANDS, type CliArgs, type Command } from "./args.js";

// per-command value flags. generator flags live under "new", the rest
// declare which commands accept them.
export const VALUE_FLAGS: Record<string, readonly Command[]> = {
  "--name": ["new", "manifest"],
  "--world": ["run"],
  "--icon": ["new"],
  "--from": ["new"],
  "--geometry": ["new"],
  "--texture": ["new"],
  "--mode": ["new"],
  "--piece": ["new"],
  "--tier": ["new"],
  "--variant": ["new"],
  "--sound": ["new"],
  "--render-method": ["new"],
  "--light": ["new"],
  "--durability": ["new"],
  "--damage": ["new"],
  "--protection": ["new"],
  "--enchant-value": ["new"],
  "--repair-item": ["new"],
  "--display-name": ["new"],
  "--recipe-kind": ["new"],
  "--pattern": ["new"],
  "--key": ["new"],
  "--result": ["new"],
  "--ingredients": ["new"],
  "--loot-kind": ["new"],
  "--rolls": ["new"],
  "--count": ["new"],
  "--min": ["new"],
  "--max": ["new"],
  "--recipe": ["new"],
  "--loot": ["new"],
  "--spawn-category": ["new"],
  "--weight": ["new"],
  "--want": ["new"],
  "--give": ["new"],
  "--dialogue-text": ["new"],
  "--dialogue-button": ["new"],
  "--animation": ["new"],
  "--equipment": ["new"],
  "--color": ["new"],
  "--fog": ["new"],
  "--x": ["new"],
  "--y": ["new"],
  "--z": ["new"],
  "--category": ["new"],
  "--group": ["new"],
  "--command": ["new"],
  "--sound-file": ["new"],
  "--unlock": ["new"],
  "--max-uses": ["new"],
  "--xp": ["new"],
  "--pools": ["new"],
  "--direction": ["new"],
  "--config": [],
  "--output": ["ship", "brarchive"],
  "--level": ["ship"],
  "--server-dir": ["brarchive"],
  "--target-version": ["init"],
  "--builder": ["init"],
  "--pack-version": ["manifest"],
  "--bump": ["publish"],
  "--dir": ["init", "manifest"],
};

// per-command toggle flags.
export const TOGGLE_FLAGS: Record<string, readonly Command[]> = {
  "--release": ["build", "run"],
  "--clean": ["build"],
  "--watch": ["run"],
  "--typecheck": ["build", "ship", "publish", "brarchive"],
  "--stats": ["build"],
  "--no-types": ["watch", "run"],
  "--fix": ["check"],
  "--no-build": ["harness"],
  "--strict": ["harness"],
  "--tag": ["publish"],
  "--push": ["publish"],
  "--js": ["init"],
  "--git": ["init"],
  "--install": ["init", "ext"],
  "--no-git": ["init"],
  "--no-install": ["init"],
  "--here": ["init"],
  "--force": ["new", "init", "import"],
  "--keep-config": ["brarchive"],
  "--spawn-egg": ["new"],
  "--dry-run": ["new", "init", "manifest", "version", "publish", "update", "import"],
  "--list": ["new"],
  "-y": ["new"],
  "--yes": ["new"],
};

// flag name to CliArgs key for value flags.
const VALUE_KEY: Record<string, keyof CliArgs> = {
  "--name": "name",
  "--icon": "icon",
  "--from": "from",
  "--geometry": "geometry",
  "--texture": "texture",
  "--mode": "mode",
  "--piece": "piece",
  "--tier": "tier",
  "--variant": "variant",
  "--sound": "sound",
  "--render-method": "renderMethod",
  "--light": "light",
  "--durability": "durability",
  "--damage": "damage",
  "--protection": "protection",
  "--enchant-value": "enchantValue",
  "--repair-item": "repairItem",
  "--display-name": "displayName",
  "--recipe-kind": "recipeKind",
  "--pattern": "pattern",
  "--key": "recipeKey",
  "--result": "result",
  "--ingredients": "ingredients",
  "--loot-kind": "lootKind",
  "--rolls": "rolls",
  "--count": "count",
  "--min": "min",
  "--max": "max",
  "--recipe": "recipe",
  "--loot": "loot",
  "--spawn-category": "spawnCategory",
  "--weight": "weight",
  "--want": "want",
  "--give": "give",
  "--dialogue-text": "dialogueText",
  "--dialogue-button": "dialogueButton",
  "--animation": "animation",
  "--equipment": "equipment",
  "--color": "color",
  "--fog": "fog",
  "--x": "x",
  "--y": "y",
  "--z": "z",
  "--category": "category",
  "--group": "group",
  "--command": "commandLine",
  "--sound-file": "soundFile",
  "--unlock": "unlock",
  "--max-uses": "maxUses",
  "--xp": "xp",
  "--pools": "pools",
  "--direction": "direction",
  "--config": "configPath",
  "--output": "output",
  "--server-dir": "serverDir",
  "--world": "world",
  "--level": "level",
  "--target-version": "targetVersion",
  "--builder": "builder",
  "--pack-version": "packVersion",
  "--bump": "bump",
  "--dir": "dir",
};

function splitFlag(token: string): {
  flag: string;
  inline: string | undefined;
} {
  const cut = token.indexOf("=");
  const short = token.startsWith("-") && !token.startsWith("--");
  if ((token.startsWith("--") || short) && cut > 0) {
    return { flag: token.slice(0, cut), inline: token.slice(cut + 1) };
  }
  return { flag: token, inline: undefined };
}

export function parseArgs(argv: readonly string[]): CliArgs {
  const args = blankArgs();
  const seenValueFlags: string[] = [];
  const seenToggleFlags: string[] = [];

  const grab = (inline: string | undefined, i: { at: number }): string | undefined => {
    if (inline !== undefined) return inline;
    const next = argv[i.at + 1];
    if (next === undefined || next.startsWith("-")) return undefined;
    i.at++;
    return next;
  };

  const setValue = (flag: string, value: string | undefined): void => {
    if (value === undefined) {
      args.unknown.push(`${flag} (missing value)`);
      return;
    }
    const key = VALUE_KEY[flag];
    if (key !== undefined) {
      (args as unknown as Record<string, string>)[key] = value;
    }
    seenValueFlags.push(flag);
  };

  const setToggle = (flag: string): void => {
    switch (flag) {
      case "--release":
        args.release = true;
        break;
      case "--clean":
        args.clean = true;
        break;
      case "--watch":
        args.watch = true;
        break;
      case "--json":
        args.json = true;
        break;
      case "--typecheck":
        args.typecheck = true;
        break;
      case "--stats":
        args.stats = true;
        break;
      case "--no-types":
        args.noTypes = true;
        break;
      case "--fix":
        args.fix = true;
        break;
      case "--no-build":
        args.noBuild = true;
        break;
      case "--strict":
        args.strict = true;
        break;
      case "--tag":
        args.tag = true;
        break;
      case "--push":
        args.push = true;
        break;
      case "--js":
        args.js = true;
        break;
      case "--git":
        args.git = true;
        break;
      case "--install":
        args.install = true;
        break;
      case "--no-git":
        args.git = false;
        args.gitSet = true;
        break;
      case "--no-install":
        args.install = false;
        args.installSet = true;
        break;
      case "--here":
        args.here = true;
        break;
      case "--force":
        args.force = true;
        break;
      case "--keep-config":
        args.keepConfig = true;
        break;
      case "--spawn-egg":
        args.spawnEgg = true;
        break;
      case "--list":
        args.list = true;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "-y":
      case "--yes":
        args.yes = true;
        break;
      default:
        return;
    }
    seenToggleFlags.push(flag);
  };

  const cursor = { at: 0 };
  for (; cursor.at < argv.length; cursor.at++) {
    const token = argv[cursor.at]!;
    const { flag, inline } = splitFlag(token);

    if (flag === "--help" || flag === "-h") {
      args.help = true;
      continue;
    }
    if (flag === "--version") {
      args.version = true;
      continue;
    }
    if (flag === "--verbose" || flag === "-v") {
      args.verbose = true;
      continue;
    }
    if (flag === "--config" || flag === "-c") {
      setValue("--config", grab(inline, cursor));
      continue;
    }
    if (flag in VALUE_FLAGS) {
      setValue(flag, grab(inline, cursor));
      continue;
    }
    if (flag in TOGGLE_FLAGS || flag === "--json") {
      setToggle(flag);
      continue;
    }

    if (flag.startsWith("-")) {
      args.unknown.push(flag);
      if ((flag in VALUE_FLAGS || flag in VALUE_KEY) && inline === undefined) {
        const next = argv[cursor.at + 1];
        if (next !== undefined && !next.startsWith("-")) cursor.at++;
      }
      continue;
    }

    if (args.command === null) {
      if ((COMMANDS as readonly string[]).includes(token)) args.command = token as Command;
      else args.extraPositionals.push(token);
      continue;
    }
    if (args.command === "init") {
      if (args.initName === undefined) {
        args.initName = token;
        continue;
      }
      if (args.initNamespace === undefined) {
        args.initNamespace = token;
        continue;
      }
    }
    if (args.command === "completion") {
      if (args.completionShell === undefined) {
        args.completionShell = token;
        continue;
      }
    }
    if (args.command === "import") {
      if (args.importDir === undefined) {
        args.importDir = token;
        continue;
      }
    }
    if (args.command === "version") {
      if (args.genVersion === undefined) {
        args.genVersion = token;
        continue;
      }
    }
    if (args.command === "new") {
      if (args.type === undefined) {
        args.type = token;
        continue;
      }
      if (args.genName === undefined) {
        args.genName = token;
        continue;
      }
    }
    args.extraPositionals.push(token);
  }

  for (const flag of seenValueFlags) {
    // --config is global, never scoped.
    if (flag === "--config") continue;
    const allowed = VALUE_FLAGS[flag] ?? [];
    if (args.command !== null && allowed.includes(args.command)) continue;
    args.unknown.push(flag);
  }
  for (const flag of seenToggleFlags) {
    const allowed = TOGGLE_FLAGS[flag] ?? [];
    if (args.command !== null && allowed.includes(args.command)) continue;
    // --json is global, never scoped.
    if (flag === "--json") continue;
    args.unknown.push(flag);
  }
  return args;
}
