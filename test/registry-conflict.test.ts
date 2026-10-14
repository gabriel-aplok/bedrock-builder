import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Tree } from "../src/generate/core/tree.js";
import { hasConflict, planTree } from "../src/generate/core/plan.js";
import { planBlock } from "../src/generate/block.js";
import { planItem } from "../src/generate/item.js";
import { setupFixture } from "./helpers.js";

// the 3.0 starter SHIPS seeded (non-empty) registry/lang files. Merging the
// first key into them changes bytes legitimately: that must read as `update`,
// never `conflict`. This guards the "nothing was written" abort on clean
// first runs against a real starter.
describe("seeded-registry merge (no false conflict)", () => {
  let fx: Awaited<ReturnType<typeof setupFixture>>;

  async function seed(rel: string, content: string): Promise<void> {
    const abs = join(fx.root, "packs", "RP", rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content, "utf8");
  }

  function skeleton(obj: unknown): string {
    return `${JSON.stringify(obj, null, 2)}\n`;
  }

  beforeEach(async () => {
    fx = await setupFixture();
    await seed(
      "textures/item_texture.json",
      skeleton({ resource_pack_name: "vanilla", texture_name: "atlas.items", texture_data: {} }),
    );
    await seed(
      "textures/terrain_texture.json",
      skeleton({
        resource_pack_name: "vanilla",
        texture_name: "atlas.terrain",
        padding: 8,
        num_mip_levels: 0,
        texture_data: {},
      }),
    );
    await seed("blocks.json", skeleton({ format_version: "1.10.0" }));
    await seed("texts/en_US.lang", "pack.name=Test\npack.description=Test\n");
    await seed("texts/languages.json", `${JSON.stringify(["en_US"])}\n`);
  });

  afterEach(async () => {
    await fx.cleanup();
  });

  function statusOf(plan: ReturnType<typeof planTree>, rel: string): string | undefined {
    return plan.find((f) => f.relPath === rel)?.status;
  }

  it("block generator merges into seeded registries without conflict", () => {
    const tree = new Tree(fx.config.__configDir);
    planBlock(tree, fx.config, { name: "ruby_block", texture: "ruby_block" });
    const plan = planTree(tree, false);

    expect(hasConflict(plan)).toBe(false);
    expect(statusOf(plan, "packs/BP/blocks/ruby_block.block.json")).toBe("create");
    expect(statusOf(plan, "packs/RP/textures/terrain_texture.json")).toBe("update");
    expect(statusOf(plan, "packs/RP/blocks.json")).toBe("update");
    expect(statusOf(plan, "packs/RP/texts/en_US.lang")).toBe("update");

    // seed survives, the new namespaced key joins it.
    const terrain = JSON.parse(tree.read("packs/RP/textures/terrain_texture.json")!) as {
      resource_pack_name: string;
      texture_data: Record<string, unknown>;
    };
    expect(terrain.resource_pack_name).toBe("vanilla");
    expect(Object.keys(terrain.texture_data)).toContain(`${fx.config.namespace}_ruby_block`);
  });

  it("item generator merges into a seeded item_texture without conflict", () => {
    const tree = new Tree(fx.config.__configDir);
    planItem(tree, fx.config, { name: "ruby", icon: "ruby" });
    const plan = planTree(tree, false);

    expect(hasConflict(plan)).toBe(false);
    expect(statusOf(plan, "packs/RP/textures/item_texture.json")).toBe("update");
    expect(statusOf(plan, "packs/BP/items/ruby.item.json")).toBe("create");
  });
});
