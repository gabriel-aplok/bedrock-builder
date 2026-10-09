import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { deploy } from "../src/commands/deploy.js";
import type { BedrockConfig } from "../src/config.js";
import { setupFixture } from "./helpers.js";

interface DeployBox {
  config: BedrockConfig;
  root: string;
  target: string;
  cleanup: () => Promise<void>;
}

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

async function untilTrue(
  check: () => Promise<boolean>,
  timeoutMs = 5000,
  gapMs = 50,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) return true;
    await new Promise((wake) => setTimeout(wake, gapMs));
  }
  return false;
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

describe("deploy --watch (smoke)", () => {
  let box: DeployBox;
  let running: Promise<void> | null = null;

  beforeEach(async () => {
    box = await openDeployBox();
    running = null;
  });
  afterEach(async () => {
    if (running) {
      process.emit("SIGINT");
      try {
        await Promise.race([running, new Promise<void>((wake) => setTimeout(wake, 5000))]);
      } catch {
        // shutdown noise is fine here.
      }
    }
    await box.cleanup();
  });

  it("initial deploy then mirrors a pack file change into the deploy target", async () => {
    running = deploy(box.config, { release: false, watch: true });

    const landed = join(
      box.target,
      "development_behavior_packs",
      box.config.name,
      "items",
      "example.item.json",
    );
    expect(await untilTrue(() => isFile(landed))).toBe(true);

    // edit a pack source file, then wait for the target copy to catch up.
    const srcItem = join(box.root, "packs", "BP", "items", "example.item.json");
    const original = await readFile(srcItem, "utf8");
    const updated = original.replace(/}\s*$/, ',"_watched":true}');
    await writeFile(srcItem, updated);

    // let chokidar finish its first scan before the write it must catch.
    await new Promise((wake) => setTimeout(wake, 500));
    await writeFile(srcItem, updated);

    const mirrored = await untilTrue(async () => {
      try {
        return (await readFile(landed, "utf8")).includes('"_watched":true');
      } catch {
        return false;
      }
    }, 8000);
    expect(mirrored).toBe(true);
  });
});
