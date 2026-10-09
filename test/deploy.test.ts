import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { deploy } from "../src/commands/deploy.js";
import {
  DeployTargetError,
  resolveDeployTarget,
  setHomeForTests,
  setPlatformForTests,
} from "../src/paths.js";
import type { BedrockConfig } from "../src/config.js";
import { setupFixture } from "./helpers.js";

interface DeployBox {
  config: BedrockConfig;
  root: string;
  target: string;
  cleanup: () => Promise<void>;
}

// fresh fixture whose deploy target is a temp dir, never the real com.mojang.
async function openDeployBox(): Promise<DeployBox> {
  const base = await setupFixture();
  const target = await mkdtemp(join(tmpdir(), "bedrock-builder-deploy-target-"));
  const config: BedrockConfig = {
    ...base.config,
    deploy: { target: "custom", customPath: target },
  };
  return {
    config,
    root: base.root,
    target,
    cleanup: async () => {
      await base.cleanup();
      await rm(target, { recursive: true, force: true });
    },
  };
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

describe("deploy command (one-shot)", () => {
  let box: DeployBox;

  beforeEach(async () => {
    box = await openDeployBox();
  });
  afterEach(async () => {
    await box.cleanup();
  });

  it("populates development_behavior_packs and development_resource_packs", async () => {
    await deploy(box.config, { release: false, watch: false });

    const bp = (...parts: string[]) =>
      join(box.target, "development_behavior_packs", box.config.name, ...parts);
    const rp = (...parts: string[]) =>
      join(box.target, "development_resource_packs", box.config.name, ...parts);
    expect(await isFile(bp("scripts", "main.js"))).toBe(true);
    expect(await isFile(bp("items", "example.item.json"))).toBe(true);
    expect(await isFile(bp("manifest.json"))).toBe(true);
    expect(await isFile(rp("manifest.json"))).toBe(true);
    expect(await isFile(rp("textures", "example.png"))).toBe(true);
  });

  it("re-deploying after a source edit produces updated content (clean slate)", async () => {
    await deploy(box.config, { release: false, watch: false });

    const srcItem = join(box.root, "packs", "BP", "items", "example.item.json");
    const original = await readFile(srcItem, "utf8");
    await writeFile(srcItem, original.replace(/}\s*$/, ',"_edited":true}'));

    // a stray file in the target must disappear on the next deploy.
    const stray = join(box.target, "development_behavior_packs", box.config.name, "stale.txt");
    await writeFile(stray, "stale");

    await deploy(box.config, { release: false, watch: false });

    const landed = join(
      box.target,
      "development_behavior_packs",
      box.config.name,
      "items",
      "example.item.json",
    );
    expect(await readFile(landed, "utf8")).toContain('"_edited":true');
    expect(await isFile(stray)).toBe(false);
  });

  it("throws DeployTargetError when target='custom' and customPath does not exist", async () => {
    const bad: BedrockConfig = {
      ...box.config,
      deploy: { target: "custom", customPath: join(box.target, "does-not-exist-subdir") },
    };
    await expect(deploy(bad, { release: false, watch: false })).rejects.toBeInstanceOf(
      DeployTargetError,
    );
  });

  it("resolves the linux mcpelauncher home", async () => {
    const home = await mkdtemp(join(tmpdir(), "bedrock-fake-home-"));
    try {
      const root = join(home, ".local", "share", "mcpelauncher", "games", "com.mojang");
      await mkdir(root, { recursive: true });
      setPlatformForTests("linux");
      setHomeForTests(home);
      const retail: BedrockConfig = {
        ...box.config,
        deploy: { target: "retail", customPath: null },
      };
      const targets = await resolveDeployTarget(retail);
      expect(targets.root).toBe(root);
    } finally {
      setPlatformForTests(null);
      setHomeForTests(null);
      await rm(home, { recursive: true, force: true });
    }
  });

  it("resolves the darwin mcpelauncher home", async () => {
    const home = await mkdtemp(join(tmpdir(), "bedrock-fake-home-"));
    try {
      const root = join(
        home,
        "Library",
        "Application Support",
        "mcpelauncher",
        "games",
        "com.mojang",
      );
      await mkdir(root, { recursive: true });
      setPlatformForTests("darwin");
      setHomeForTests(home);
      const retail: BedrockConfig = {
        ...box.config,
        deploy: { target: "retail", customPath: null },
      };
      const targets = await resolveDeployTarget(retail);
      expect(targets.root).toBe(root);
    } finally {
      setPlatformForTests(null);
      setHomeForTests(null);
      await rm(home, { recursive: true, force: true });
    }
  });

  it("resolves the windows preview launcher home", async () => {
    const appData = await mkdtemp(join(tmpdir(), "bedrock-fake-appdata-"));
    const savedAppData = process.env.APPDATA;
    const savedLocal = process.env.LOCALAPPDATA;
    try {
      const root = join(
        appData,
        "Minecraft Bedrock Preview",
        "Users",
        "Shared",
        "games",
        "com.mojang",
      );
      await mkdir(root, { recursive: true });
      process.env.APPDATA = appData;
      delete process.env.LOCALAPPDATA;
      setPlatformForTests("win32");
      const preview: BedrockConfig = {
        ...box.config,
        deploy: { target: "preview", customPath: null },
      };
      const targets = await resolveDeployTarget(preview);
      expect(targets.root).toBe(root);
    } finally {
      setPlatformForTests(null);
      if (savedAppData === undefined) delete process.env.APPDATA;
      else process.env.APPDATA = savedAppData;
      if (savedLocal === undefined) delete process.env.LOCALAPPDATA;
      else process.env.LOCALAPPDATA = savedLocal;
      await rm(appData, { recursive: true, force: true });
    }
  });

  it("rejects preview on non-windows platforms", async () => {
    setPlatformForTests("linux");
    try {
      const preview: BedrockConfig = {
        ...box.config,
        deploy: { target: "preview", customPath: null },
      };
      await expect(resolveDeployTarget(preview)).rejects.toBeInstanceOf(DeployTargetError);
    } finally {
      setPlatformForTests(null);
    }
  });
});
