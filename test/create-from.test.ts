import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { create } from "../src/commands/create.js";
import { GenerateError } from "../src/generate/core/errors.js";
import { setupFixture } from "./helpers.js";

const dirs: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "bb-from-"));
  dirs.push(dir);
  return dir;
}

const SWORD = {
  "minecraft:item": {
    description: { identifier: "other:sword" },
    components: { "minecraft:icon": "sword" },
  },
};

describe("new --from", () => {
  let fx: Awaited<ReturnType<typeof setupFixture>>;

  async function setup(): Promise<void> {
    fx = await setupFixture();
  }

  afterEach(async () => {
    await fx?.cleanup().catch(() => undefined);
    for (const dir of dirs.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("imports the behavior body and rewrites the namespace", async () => {
    await setup();
    const dir = await tempDir();
    const source = join(dir, "sword.json");
    await writeFile(source, JSON.stringify(SWORD));
    await create(fx.config, { type: "item", name: "ruby", from: source });

    const body = JSON.parse(
      await readFile(join(fx.config.__configDir, "packs", "BP", "items", "ruby.item.json"), "utf8"),
    );
    expect(body["minecraft:item"].components).toEqual({ "minecraft:icon": "sword" });
    expect(body["minecraft:item"].description.identifier).toBe("test_addon:sword");
  });

  it("still wires registries and lang from the flags", async () => {
    await setup();
    const dir = await tempDir();
    const source = join(dir, "sword.json");
    await writeFile(source, JSON.stringify(SWORD));
    await create(fx.config, { type: "item", name: "ruby", from: source });

    const atlas = JSON.parse(
      await readFile(
        join(fx.config.__configDir, "packs", "RP", "textures", "item_texture.json"),
        "utf8",
      ),
    );
    expect(atlas.texture_data).toBeDefined();
  });

  it("rejects a missing source file", async () => {
    await setup();
    await expect(
      create(fx.config, { type: "item", name: "ruby", from: "nope.json" }),
    ).rejects.toBeInstanceOf(GenerateError);
  });

  it("rejects a non-object source file", async () => {
    await setup();
    const dir = await tempDir();
    const source = join(dir, "list.json");
    await writeFile(source, "[1, 2]");
    await expect(
      create(fx.config, { type: "item", name: "ruby", from: source }),
    ).rejects.toBeInstanceOf(GenerateError);
  });

  it("rejects content matching no behavior file", async () => {
    await setup();
    const dir = await tempDir();
    const source = join(dir, "other.json");
    await writeFile(source, JSON.stringify({ "minecraft:block": {} }));
    await expect(
      create(fx.config, { type: "item", name: "ruby", from: source }),
    ).rejects.toBeInstanceOf(GenerateError);
  });

  it("imports entity bodies while keeping egg and sidecars", async () => {
    await setup();
    const dir = await tempDir();
    const source = join(dir, "goblin.json");
    await writeFile(
      source,
      JSON.stringify({
        "minecraft:entity": {
          description: { identifier: "other:goblin", is_summonable: true },
        },
      }),
    );
    await create(fx.config, {
      type: "entity",
      name: "goblin",
      mode: "2d",
      from: source,
      spawnEgg: true,
      loot: "entity",
    });

    const body = JSON.parse(
      await readFile(join(fx.config.__configDir, "packs", "BP", "entities", "goblin.json"), "utf8"),
    );
    expect(body["minecraft:entity"].description.identifier).toBe("test_addon:goblin");
    expect(body["minecraft:entity"].description.is_summonable).toBe(true);
    // egg and loot sidecar still wired from the flags.
    const egg = JSON.parse(
      await readFile(
        join(fx.config.__configDir, "packs", "BP", "items", "goblin_spawn_egg.item.json"),
        "utf8",
      ),
    );
    expect(egg["minecraft:item"].description.identifier).toBe("test_addon:goblin_spawn_egg");
    const loot = JSON.parse(
      await readFile(
        join(fx.config.__configDir, "packs", "BP", "loot_tables", "entities", "goblin.json"),
        "utf8",
      ),
    );
    expect(loot.pools).toHaveLength(1);
  });

  it("imports block bodies while keeping recipe sidecars", async () => {
    await setup();
    const dir = await tempDir();
    const source = join(dir, "ore.json");
    await writeFile(
      source,
      JSON.stringify({
        "minecraft:block": {
          description: { identifier: "other:ore" },
          components: { "minecraft:light_emission": 12 },
        },
      }),
    );
    await create(fx.config, {
      type: "block",
      name: "ore",
      from: source,
      recipe: "shapeless",
      ingredients: "minecraft:cobblestone",
    });

    const body = JSON.parse(
      await readFile(
        join(fx.config.__configDir, "packs", "BP", "blocks", "ore.block.json"),
        "utf8",
      ),
    );
    expect(body["minecraft:block"].description.identifier).toBe("test_addon:ore");
    expect(body["minecraft:block"].components).toEqual({ "minecraft:light_emission": 12 });
    const recipe = JSON.parse(
      await readFile(join(fx.config.__configDir, "packs", "BP", "recipes", "ore.json"), "utf8"),
    );
    expect(recipe["minecraft:recipe_shapeless"].description.identifier).toBe("test_addon:ore");
  });
});
