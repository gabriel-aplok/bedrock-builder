import { describe, expect, it } from "vitest";

import { Tree } from "../src/generate/core/tree.js";
import {
  ensureLanguages,
  mergeBlocks,
  mergeItemTexture,
  mergeLang,
  mergeTerrainTexture,
} from "../src/generate/core/registries.js";

// in-memory root: merges seed skeletons, disk is never touched.
const MEM_ROOT = "C:/nonexistent-root";

function blankTree(): Tree {
  return new Tree(MEM_ROOT);
}

function readJson(tree: Tree, rel: string): any {
  return JSON.parse(tree.read(rel)!);
}

describe("registry merges (idempotent, key-based)", () => {
  it("item_texture: seeds vanilla skeleton when absent, upserts the key", () => {
    const tree = blankTree();
    mergeItemTexture(tree, "RP", "ns_ruby", "textures/items/ruby");
    const file = readJson(tree, "RP/textures/item_texture.json");
    expect(file.resource_pack_name).toBe("vanilla");
    expect(file.texture_name).toBe("atlas.items");
    expect(file.texture_data.ns_ruby).toEqual({ textures: "textures/items/ruby" });
  });

  it("item_texture: re-adding the same key+path is a no-op (byte-identical)", () => {
    const tree = blankTree();
    mergeItemTexture(tree, "RP", "ns_ruby", "textures/items/ruby");
    const first = tree.read("RP/textures/item_texture.json")!;
    mergeItemTexture(tree, "RP", "ns_ruby", "textures/items/ruby");
    expect(tree.read("RP/textures/item_texture.json")!).toBe(first);
  });

  it("item_texture: adding a second key keeps both, sorted", () => {
    const tree = blankTree();
    mergeItemTexture(tree, "RP", "ns_zinc", "textures/items/zinc");
    mergeItemTexture(tree, "RP", "ns_alpha", "textures/items/alpha");
    expect(Object.keys(readJson(tree, "RP/textures/item_texture.json").texture_data)).toEqual([
      "ns_alpha",
      "ns_zinc",
    ]);
  });

  it("terrain_texture: seeds skeleton with num_mip_levels 0, padding 8", () => {
    const tree = blankTree();
    mergeTerrainTexture(tree, "RP", "ns_block", "textures/blocks/block");
    const file = readJson(tree, "RP/textures/terrain_texture.json");
    expect(file.resource_pack_name).toBe("vanilla");
    expect(file.texture_name).toBe("atlas.terrain");
    expect(file.padding).toBe(8);
    expect(file.num_mip_levels).toBe(0);
    expect(file.texture_data.ns_block).toEqual({ textures: "textures/blocks/block" });
  });

  it("blocks.json: seeds format_version, upserts the id entry, idempotent", () => {
    const tree = blankTree();
    mergeBlocks(tree, "RP", "ns:block", "ns_block", "stone");
    const first = tree.read("RP/blocks.json")!;
    expect(readJson(tree, "RP/blocks.json").format_version).toBe("1.10.0");
    expect(readJson(tree, "RP/blocks.json")["ns:block"]).toEqual({
      textures: "ns_block",
      sound: "stone",
    });

    mergeBlocks(tree, "RP", "ns:block", "ns_block", "stone");
    expect(tree.read("RP/blocks.json")!).toBe(first);
  });

  it("en_US.lang: upserts without duplicating, preserves comments", () => {
    const tree = blankTree();
    tree.write("RP/texts/en_US.lang", "# header comment\nitem.ns:old=Old\n");
    mergeLang(tree, "RP", "item.ns:ruby", "Ruby");
    const lang = tree.read("RP/texts/en_US.lang")!;
    expect(lang).toContain("# header comment");
    expect(lang).toContain("item.ns:old=Old");
    expect(lang).toContain("item.ns:ruby=Ruby");

    // same key, new value: replaced in place, never duplicated.
    mergeLang(tree, "RP", "item.ns:ruby", "Ruby Gem");
    const lines = tree.read("RP/texts/en_US.lang")!.split("\n");
    expect(lines.filter((l) => l.startsWith("item.ns:ruby="))).toEqual(["item.ns:ruby=Ruby Gem"]);
  });

  it("en_US.lang: re-adding the same key+value is a no-op", () => {
    const tree = blankTree();
    mergeLang(tree, "RP", "item.ns:ruby", "Ruby");
    const first = tree.read("RP/texts/en_US.lang")!;
    mergeLang(tree, "RP", "item.ns:ruby", "Ruby");
    expect(tree.read("RP/texts/en_US.lang")!).toBe(first);
  });

  it("languages.json: creates ['en_US'] when absent, idempotent thereafter", () => {
    const tree = blankTree();
    ensureLanguages(tree, "RP");
    expect(readJson(tree, "RP/texts/languages.json")).toEqual(["en_US"]);
    const first = tree.read("RP/texts/languages.json")!;
    ensureLanguages(tree, "RP");
    expect(tree.read("RP/texts/languages.json")!).toBe(first);
  });

  it("languages.json: keeps existing languages and adds en_US once", () => {
    const tree = blankTree();
    tree.write("RP/texts/languages.json", JSON.stringify(["fr_FR"]));
    ensureLanguages(tree, "RP");
    expect(readJson(tree, "RP/texts/languages.json")).toEqual(["fr_FR", "en_US"]);
  });
});
