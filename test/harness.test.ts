import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { harnessCheck } from "../src/harness/check.js";
import { setupFixture } from "./helpers.js";
import { build } from "../src/commands/build.js";

const dirs: string[] = [];

async function tempOut(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "bb-harness-"));
  dirs.push(dir);
  return dir;
}

function dump(obj: unknown): string {
  return `${JSON.stringify(obj, null, 2)}\n`;
}

async function seedValid(out: string): Promise<void> {
  await mkdir(join(out, "packs", "BP", "items"), { recursive: true });
  await mkdir(join(out, "packs", "RP", "textures"), { recursive: true });
  await writeFile(
    join(out, "packs", "BP", "items", "ruby.item.json"),
    dump({
      "minecraft:item": {
        description: { identifier: "test:ruby" },
        components: {
          "minecraft:icon": "test_ruby",
          "minecraft:display_name": { value: "Ruby" },
        },
      },
    }),
  );
  await writeFile(
    join(out, "packs", "RP", "textures", "item_texture.json"),
    dump({
      resource_pack_name: "vanilla",
      texture_name: "atlas.items",
      texture_data: { test_ruby: { textures: "textures/items/ruby" } },
    }),
  );
}

describe("harnessCheck", () => {
  afterEach(async () => {
    for (const dir of dirs.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("passes a consistent pack", async () => {
    const out = await tempOut();
    await seedValid(out);
    const result = await harnessCheck(out);
    expect(result.failures).toEqual([]);
    expect(result.jsonFiles).toBe(2);
  });

  it("flags invalid json", async () => {
    const out = await tempOut();
    await seedValid(out);
    await mkdir(join(out, "packs", "BP", "blocks"), { recursive: true });
    await writeFile(join(out, "packs", "BP", "blocks", "bad.json"), "{nope");
    const result = await harnessCheck(out);
    expect(result.failures.some((f) => f.message.includes("invalid json"))).toBe(true);
  });

  it("flags a missing icon atlas entry", async () => {
    const out = await tempOut();
    await seedValid(out);
    await writeFile(
      join(out, "packs", "BP", "items", "ruby.item.json"),
      dump({
        "minecraft:item": {
          description: { identifier: "test:ruby" },
          components: { "minecraft:icon": "test_missing" },
        },
      }),
    );
    const result = await harnessCheck(out);
    expect(result.failures.some((f) => f.message.includes("test_missing"))).toBe(true);
  });

  it("flags a spawn rule for an unknown entity", async () => {
    const out = await tempOut();
    await seedValid(out);
    await mkdir(join(out, "packs", "BP", "spawn_rules"), { recursive: true });
    await writeFile(
      join(out, "packs", "BP", "spawn_rules", "ghost.json"),
      dump({
        "minecraft:spawn_rules": {
          description: { identifier: "test:ghost" },
          conditions: [],
        },
      }),
    );
    const result = await harnessCheck(out);
    expect(result.failures.some((f) => f.message.includes("test:ghost"))).toBe(true);
  });

  it("flags duplicate recipe identifiers", async () => {
    const out = await tempOut();
    await seedValid(out);
    await mkdir(join(out, "packs", "BP", "recipes"), { recursive: true });
    const recipe = (id: string) =>
      dump({
        "minecraft:recipe_shapeless": {
          description: { identifier: id },
          tags: ["crafting_table"],
          ingredients: [{ item: "minecraft:stick" }],
          result: { item: "test:ruby" },
        },
      });
    await writeFile(join(out, "packs", "BP", "recipes", "a.json"), recipe("test:x"));
    await writeFile(join(out, "packs", "BP", "recipes", "b.json"), recipe("test:x"));
    const result = await harnessCheck(out);
    expect(result.failures.some((f) => f.message.includes('duplicate recipe "test:x"'))).toBe(true);
  });

  it("passes strict when icons exist and lang keys are used", async () => {
    const out = await tempOut();
    await seedValid(out);
    await mkdir(join(out, "packs", "BP"), { recursive: true });
    await mkdir(join(out, "packs", "RP"), { recursive: true });
    await writeFile(join(out, "packs", "BP", "pack_icon.png"), "x");
    await writeFile(join(out, "packs", "RP", "pack_icon.png"), "x");
    await mkdir(join(out, "packs", "RP", "texts"), { recursive: true });
    await writeFile(join(out, "packs", "RP", "texts", "en_US.lang"), "test_ruby=Ruby\n");
    const result = await harnessCheck(out, { strict: true });
    expect(result.failures).toEqual([]);
  });

  it("flags missing pack icons in strict mode only", async () => {
    const out = await tempOut();
    await seedValid(out);
    const lax = await harnessCheck(out);
    expect(lax.failures).toEqual([]);
    const strict = await harnessCheck(out, { strict: true });
    expect(strict.failures.some((f) => f.message.includes("missing pack icon"))).toBe(true);
  });

  it("flags unused lang keys in strict mode", async () => {
    const out = await tempOut();
    await seedValid(out);
    await mkdir(join(out, "packs", "BP"), { recursive: true });
    await mkdir(join(out, "packs", "RP", "texts"), { recursive: true });
    await writeFile(join(out, "packs", "BP", "pack_icon.png"), "x");
    await writeFile(join(out, "packs", "RP", "pack_icon.png"), "x");
    await writeFile(
      join(out, "packs", "RP", "texts", "en_US.lang"),
      "test_ruby=Ruby\npack.old=Old\n",
    );
    const result = await harnessCheck(out, { strict: true });
    expect(result.failures.some((f) => f.message.includes('unused lang key "pack.old"'))).toBe(
      true,
    );
  });

  it("passes the real built fixture", async () => {
    const fixture = await setupFixture();
    try {
      await build(fixture.config, {});
      const result = await harnessCheck(fixture.config.out);
      expect(result.failures).toEqual([]);
    } finally {
      await fixture.cleanup();
    }
  }, 20000);
});
