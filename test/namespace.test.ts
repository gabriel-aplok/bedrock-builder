import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { deriveNamespace } from "../src/generate/core/identifier.js";
import { setupFixture } from "./helpers.js";

async function putJson(root: string, file: string, obj: unknown): Promise<string> {
  const path = join(root, file);
  await writeFile(path, JSON.stringify(obj, null, 2), "utf8");
  return path;
}

// standard-shape config against the fixture packs; namespace comes via extra.
function standardConfig(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "minecraftBedrock",
    name: "My Cool Add-On!",
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

describe("deriveNamespace (pure)", () => {
  it("lowercases and snake-cases an arbitrary name", () => {
    expect(deriveNamespace("My Cool Add-On!")).toBe("my_cool_add_on");
  });

  it("trims leading/trailing underscores", () => {
    expect(deriveNamespace("  spaced  ")).toBe("spaced");
  });

  it("prefixes a leading digit", () => {
    expect(deriveNamespace("3dpack")).toBe("ns_3dpack");
  });

  it("never returns empty", () => {
    expect(deriveNamespace("!!!")).toBe("ns");
  });

  it("preserves a clean snake_case name", () => {
    expect(deriveNamespace("my_addon")).toBe("my_addon");
  });
});

describe("config namespace resolution", () => {
  let fixture: Awaited<ReturnType<typeof setupFixture>>;

  beforeEach(async () => {
    fixture = await setupFixture();
  });
  afterEach(async () => {
    await fixture.cleanup();
  });

  it("derives from the name when no namespace key is present", async () => {
    const path = await putJson(fixture.root, "config.json", standardConfig());
    expect((await loadConfig(path)).namespace).toBe("my_cool_add_on");
  });

  it("uses a valid explicit namespace", async () => {
    const path = await putJson(
      fixture.root,
      "config.json",
      standardConfig({ namespace: "my_addon" }),
    );
    expect((await loadConfig(path)).namespace).toBe("my_addon");
  });

  it("is NON-FATAL on a malformed namespace: derives instead of throwing", async () => {
    // uppercase, spaces, colon: all invalid, yet load must succeed.
    const path = await putJson(
      fixture.root,
      "config.json",
      standardConfig({ namespace: "Bad NS:1" }),
    );
    expect((await loadConfig(path)).namespace).toBe("my_cool_add_on");
  });

  it("is NON-FATAL on a reserved namespace: derives instead of throwing", async () => {
    const path = await putJson(
      fixture.root,
      "config.json",
      standardConfig({ namespace: "minecraft" }),
    );
    expect((await loadConfig(path)).namespace).toBe("my_cool_add_on");
  });

  it("legacy bedrock.config.json (no namespace) derives from name", async () => {
    // fixture name is "test-addon".
    expect(fixture.config.namespace).toBe("test_addon");
  });
});
