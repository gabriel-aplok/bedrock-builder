import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ConfigError, loadConfig } from "../src/config.js";
import { setupFixture } from "./helpers.js";

async function putJson(root: string, file: string, obj: unknown): Promise<string> {
  const path = join(root, file);
  await writeFile(path, JSON.stringify(obj, null, 2), "utf8");
  return path;
}

// standard shape against the fixture packs, with per-test cli overrides.
function standardConfig(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "minecraftBedrock",
    name: "standard-addon",
    authors: ["gabriel-aplok"],
    targetVersion: "1.21.0",
    packs: { behaviorPack: "packs/BP", resourcePack: "packs/RP" },
    bb: {
      version: "2.3.4",
      entry: "src/main.ts",
      out: "dist",
      deploy: { target: "custom", customPath: "." },
      ...extra,
    },
  };
}

describe("loadConfig", () => {
  let fixture: Awaited<ReturnType<typeof setupFixture>>;

  beforeEach(async () => {
    fixture = await setupFixture();
  });
  afterEach(async () => {
    await fixture.cleanup();
  });

  it("loads the legacy bedrock.config.json shape", async () => {
    // fixture already carries the legacy file; check the normalization.
    const c = fixture.config;
    expect(c.name).toBe("test-addon");
    expect(c.version).toBe("1.0.0");
    expect(c.packs.bp.endsWith(join("packs", "BP"))).toBe(true);
    expect(c.packs.rp.endsWith(join("packs", "RP"))).toBe(true);
    expect(c.entry.endsWith(join("src", "main.ts"))).toBe(true);
    expect(c.deploy.target).toBe("custom");
  });

  it("loads the standard Bedrock-OSS shape with a bb namespace", async () => {
    const path = await putJson(fixture.root, "config.json", standardConfig());

    const c = await loadConfig(path);
    expect(c.name).toBe("standard-addon");
    expect(c.version).toBe("2.3.4");
    expect(c.packs.bp.endsWith(join("packs", "BP"))).toBe(true);
    expect(c.packs.rp.endsWith(join("packs", "RP"))).toBe(true);
    expect(c.entry.endsWith(join("src", "main.ts"))).toBe(true);
    expect(c.deploy.target).toBe("custom");
    expect(c.minecraft?.serverVersion).toBe("1.21.0");
  });

  it("prefers top-level namespace and worlds per the Bedrock-OSS standard", async () => {
    const cfg = standardConfig();
    cfg.namespace = "top_level";
    cfg.worlds = ["./worlds/1"];
    (cfg["bb"] as Record<string, unknown>).namespace = "bb_level";
    const path = await putJson(fixture.root, "config.json", cfg);

    const c = await loadConfig(path);
    expect(c.namespace).toBe("top_level");
    expect(c.worlds).toEqual(["./worlds/1"]);
  });

  it("defaults worlds to empty when omitted", async () => {
    const path = await putJson(fixture.root, "config.json", standardConfig());
    expect((await loadConfig(path)).worlds).toEqual([]);
  });

  it("normalizes extension names plus settings", async () => {
    const cfg = standardConfig();
    cfg.bb = {
      ...(cfg.bb as Record<string, unknown>),
      extensions: ["json-cleaner", { name: "emissive-fixer", settings: { stripPackIcons: true } }],
    };
    const path = await putJson(fixture.root, "config.json", cfg);

    expect((await loadConfig(path)).extensions).toEqual([
      { name: "json-cleaner", settings: {} },
      { name: "emissive-fixer", settings: { stripPackIcons: true } },
    ]);
  });

  it("supports a .js entry", async () => {
    await writeFile(join(fixture.root, "src", "main.js"), "console.log('hi');", "utf8");
    const path = await putJson(
      fixture.root,
      "config.json",
      standardConfig({ entry: "src/main.js" }),
    );

    expect((await loadConfig(path)).entry.endsWith(join("src", "main.js"))).toBe(true);
  });

  it("defaults the entry to src/main.js when main.ts is absent", async () => {
    await rm(join(fixture.root, "src", "main.ts"), { force: true });
    await writeFile(join(fixture.root, "src", "main.js"), "console.log('hi');", "utf8");

    const cfg = standardConfig();
    delete (cfg["bb"] as Record<string, unknown>).entry;
    const path = await putJson(fixture.root, "config.json", cfg);

    expect((await loadConfig(path)).entry.endsWith(join("src", "main.js"))).toBe(true);
  });

  it("sources version from package.json when the config omits it", async () => {
    await putJson(fixture.root, "package.json", { name: "x", version: "9.8.7" });

    const cfg = standardConfig();
    delete (cfg["bb"] as Record<string, unknown>).version;
    const path = await putJson(fixture.root, "config.json", cfg);

    expect((await loadConfig(path)).version).toBe("9.8.7");
  });

  it("prefers config.json over bedrock.config.json when both exist", async () => {
    // fixture already has legacy bedrock.config.json (name: test-addon).
    await putJson(fixture.root, "config.json", standardConfig());

    const prevCwd = process.cwd();
    try {
      process.chdir(fixture.root);
      expect((await loadConfig()).name).toBe("standard-addon");
    } finally {
      process.chdir(prevCwd);
    }
  });

  it("rejects an invalid semver version with exit code 2", async () => {
    const path = await putJson(
      fixture.root,
      "config.json",
      standardConfig({ version: "not-semver" }),
    );

    await expect(loadConfig(path)).rejects.toMatchObject({ name: "ConfigError", exitCode: 2 });
  });

  it("rejects a config missing name with exit code 2", async () => {
    const cfg = standardConfig();
    delete cfg.name;
    const path = await putJson(fixture.root, "config.json", cfg);

    await expect(loadConfig(path)).rejects.toBeInstanceOf(ConfigError);
  });

  it("parses bb.serverDir anchored to the config dir", async () => {
    const path = await putJson(fixture.root, "config.json", standardConfig({ serverDir: "./srv" }));

    const c = await loadConfig(path);
    expect(c.serverDir).toBe(join(fixture.root, "srv"));
  });

  it("defaults serverDir to null when absent", async () => {
    const path = await putJson(fixture.root, "config.json", standardConfig());

    const c = await loadConfig(path);
    expect(c.serverDir).toBeNull();
  });

  it("rejects a non-string bb.serverDir with exit code 2", async () => {
    const path = await putJson(fixture.root, "config.json", standardConfig({ serverDir: 42 }));

    await expect(loadConfig(path)).rejects.toMatchObject({ name: "ConfigError", exitCode: 2 });
  });
});
