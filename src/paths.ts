import { homedir } from "node:os";
import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { BedrockConfig } from "./config.js";

export interface DeployTargets {
  bp: string;
  rp: string;
  root: string;
}

export class DeployTargetError extends Error {
  readonly exitCode = 3;
  constructor(message: string) {
    super(message);
    this.name = "DeployTargetError";
  }
}

async function isDir(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

interface InstallDir {
  env: "APPDATA" | "LOCALAPPDATA";
  sub: string;
  label: string;
}

let platformOverride: string | null = null;
let homeOverride: string | null = null;

export function setPlatformForTests(platform: string | null): void {
  platformOverride = platform;
}

export function setHomeForTests(home: string | null): void {
  homeOverride = home;
}

function currentPlatform(): string {
  return platformOverride ?? process.platform;
}

function currentHome(): string {
  return homeOverride ?? homedir();
}

const KNOWN_DIRS: InstallDir[] = [
  {
    env: "APPDATA",
    sub: "Minecraft Bedrock/Users/Shared/games/com.mojang",
    label: "Bedrock launcher",
  },
  {
    env: "APPDATA",
    sub: "Minecraft Bedrock Preview/Users/Shared/games/com.mojang",
    label: "Bedrock Preview launcher",
  },
  {
    env: "LOCALAPPDATA",
    sub: "Packages/Microsoft.MinecraftUWP_8wekyb3d8bbwe/LocalState/games/com.mojang",
    label: "Store build",
  },
  {
    env: "LOCALAPPDATA",
    sub: "Packages/Microsoft.MinecraftWindowsBeta_8wekyb3d8bbwe/LocalState/games/com.mojang",
    label: "Store beta",
  },
  {
    env: "LOCALAPPDATA",
    sub: "Packages/Microsoft.MinecraftEducationEdition_8wekyb3d8bbwe/LocalState/games/com.mojang",
    label: "Education UWP",
  },
  {
    env: "APPDATA",
    sub: "Minecraft Education Edition/games/com.mojang",
    label: "Education desktop",
  },
];

async function scanUwpPackages(): Promise<string | undefined> {
  const base = process.env.LOCALAPPDATA;
  if (!base) return undefined;
  const pkgs = join(base, "Packages");
  if (!(await isDir(pkgs))) return undefined;

  let names: string[];
  try {
    names = await readdir(pkgs);
  } catch {
    return undefined;
  }
  for (const name of names) {
    if (!name.toLowerCase().startsWith("microsoft.minecraftuwp_")) continue;
    const home = join(pkgs, name, "LocalState", "games", "com.mojang");
    if (await isDir(home)) return home;
  }
  return undefined;
}

async function findWindowsHome(tried: string[]): Promise<string | undefined> {
  for (const spot of KNOWN_DIRS) {
    const base = process.env[spot.env];
    if (!base) continue;
    const full = join(base, spot.sub);
    tried.push(`  - ${spot.label}: ${full}`);
    if (await isDir(full)) return full;
  }
  const extra = await scanUwpPackages();
  if (extra) tried.push(`  - Store scan: ${extra}`);
  return extra;
}

function launcherHomes(): { path: string; label: string }[] {
  const home = currentHome();
  if (currentPlatform() === "darwin") {
    return [
      {
        path: join(home, "Library", "Application Support", "mcpelauncher", "games", "com.mojang"),
        label: "mcpelauncher",
      },
    ];
  }
  return [
    {
      path: join(home, ".local", "share", "mcpelauncher", "games", "com.mojang"),
      label: "mcpelauncher",
    },
    {
      path: join(
        home,
        ".var",
        "app",
        "io.mrarm.mcpelauncher",
        "data",
        "mcpelauncher",
        "games",
        "com.mojang",
      ),
      label: "mcpelauncher flatpak",
    },
  ];
}

const PREVIEW_DIRS: InstallDir[] = [
  {
    env: "APPDATA",
    sub: "Minecraft Bedrock Preview/Users/Shared/games/com.mojang",
    label: "Bedrock Preview launcher",
  },
  {
    env: "LOCALAPPDATA",
    sub: "Packages/Microsoft.MinecraftWindowsBeta_8wekyb3d8bbwe/LocalState/games/com.mojang",
    label: "Store beta",
  },
];

async function findPreviewHome(): Promise<string> {
  if (currentPlatform() !== "win32") {
    throw new DeployTargetError(
      "Preview deploy is only supported on Windows. Use deploy.target custom with a Preview com.mojang path.",
    );
  }
  const tried: string[] = [];
  for (const spot of PREVIEW_DIRS) {
    const base = process.env[spot.env];
    if (!base) continue;
    const full = join(base, spot.sub);
    tried.push(`  - ${spot.label}: ${full}`);
    if (await isDir(full)) return full;
  }
  throw new DeployTargetError(
    `No Preview com.mojang found. Checked:\n${tried.join("\n")}\nInstall the Preview build or point deploy.customPath at its data dir.`,
  );
}

async function findRetailHome(): Promise<string> {
  const tried: string[] = [];
  if (currentPlatform() === "win32") {
    const home = await findWindowsHome(tried);
    if (home) return home;
  } else if (currentPlatform() === "darwin" || currentPlatform() === "linux") {
    for (const spot of launcherHomes()) {
      tried.push(`  - ${spot.label}: ${spot.path}`);
      if (await isDir(spot.path)) return spot.path;
    }
  } else {
    throw new DeployTargetError(
      `Retail deploy is not supported on ${currentPlatform()}. Use deploy.target custom.`,
    );
  }
  const hint =
    currentPlatform() === "win32"
      ? "Point deploy.customPath at your data dir instead."
      : "Install the mcpelauncher or point deploy.customPath at your data dir instead.";
  throw new DeployTargetError(
    `No com.mojang found under any known install. Checked:\n${tried.join("\n")}\n${hint}`,
  );
}

export async function resolveDeployTarget(config: BedrockConfig): Promise<DeployTargets> {
  let root: string;
  if (config.deploy.target === "custom") {
    const custom = config.deploy.customPath?.trim() ?? "";
    if (custom === "") throw new DeployTargetError('Target "custom" needs deploy.customPath set.');
    root = resolve(config.deploy.customPath!);
    if (!(await isDir(root))) throw new DeployTargetError(`Custom deploy dir missing: ${root}`);
  } else if (config.deploy.target === "preview") {
    root = await findPreviewHome();
  } else {
    root = await findRetailHome();
  }
  return {
    root,
    bp: join(root, "development_behavior_packs", config.name),
    rp: join(root, "development_resource_packs", config.name),
  };
}
