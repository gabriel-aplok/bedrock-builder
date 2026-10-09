import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Tree } from "../src/generate/core/tree.js";
import { planTree } from "../src/generate/core/plan.js";
import { GenerateError } from "../src/generate/core/errors.js";
import { planWeapon } from "../src/generate/weapon.js";
import { planTool } from "../src/generate/tool.js";
import { planArmor } from "../src/generate/armor.js";
import { planItem } from "../src/generate/item.js";
import { planEntity } from "../src/generate/entity.js";
import { planBlock } from "../src/generate/block.js";
import { planAnimation } from "../src/generate/animation.js";
import { planEquipment } from "../src/generate/equipment.js";
import { planFeature } from "../src/generate/feature.js";
import { planFeatureRule } from "../src/generate/feature_rule.js";
import { planBiome } from "../src/generate/biome.js";
import { planCamera } from "../src/generate/camera.js";
import { planFog } from "../src/generate/fog.js";
import { planFunction } from "../src/generate/function.js";
import { planItemCatalog } from "../src/generate/item_catalog.js";
import { planParticle } from "../src/generate/particle.js";
import { planVoxelShape } from "../src/generate/voxel_shape.js";
import { planBiomesClient } from "../src/generate/biomes_client.js";
import { planBlockCulling } from "../src/generate/block_culling.js";
import { planSound } from "../src/generate/sound.js";
import { planDimension } from "../src/generate/dimension.js";
import { planUi } from "../src/generate/ui.js";
import { planDialogue } from "../src/generate/dialogue.js";
import { planRecipe } from "../src/generate/recipe.js";
import { planSpawn } from "../src/generate/spawn.js";
import { planTrade } from "../src/generate/trade.js";
import { planLoot } from "../src/generate/loot.js";
import { planLootTable } from "../src/generate/loot_table.js";
import type { CreateOptions } from "../src/generate/core/types.js";
import { setupFixture } from "./helpers.js";

// fixture name "test-addon" derives this namespace.
const NS = "test_addon";

type Planner = (t: Tree, c: Parameters<typeof planItem>[1], o: CreateOptions) => unknown;

interface RunResult {
  tree: Tree;
  paths: string[];
  json: (rel: string) => any;
  text: (rel: string) => string;
}

describe("pure planners", () => {
  let fx: Awaited<ReturnType<typeof setupFixture>>;

  // stage a planner into a throwaway tree with JSON/text readers.
  function stage(planner: Planner, opts: CreateOptions): RunResult {
    const tree = new Tree(fx.config.__configDir);
    planner(tree, fx.config, opts);
    return {
      tree,
      paths: tree.paths(),
      json: (rel: string) => JSON.parse(tree.read(rel)!) as Record<string, unknown>,
      text: (rel: string) => tree.read(rel)!,
    };
  }

  function rejectsBadName(opts: CreateOptions): void {
    const tree = new Tree(fx.config.__configDir);
    expect(() => planItem(tree, fx.config, opts)).toThrow(GenerateError);
  }

  beforeEach(async () => {
    fx = await setupFixture();
  });
  afterEach(async () => {
    await fx.cleanup();
  });

  describe("weapon", () => {
    it("2D: emits item + registries, plain-string icon, namespaced atlas key, no geo/anim", () => {
      const { paths, json, text } = stage(planWeapon, { name: "fire_sword", icon: "sword" });

      expect(paths).toEqual([
        "packs/BP/items/fire_sword.item.json",
        "packs/RP/texts/en_US.lang",
        "packs/RP/texts/languages.json",
        "packs/RP/textures/item_texture.json",
      ]);

      const item = json("packs/BP/items/fire_sword.item.json")["minecraft:item"];
      expect(item.description.identifier).toBe(`${NS}:fire_sword`);
      expect(item.components["minecraft:icon"]).toBe(`${NS}_fire_sword`);
      expect(typeof item.components["minecraft:icon"]).toBe("string");
      expect(item.components["minecraft:weapon"]).toBeUndefined();
      expect(item.components["minecraft:damage"]).toBe(7);
      expect(item.components["minecraft:durability"].max_durability).toBe(1561);
      expect(item.components["minecraft:enchantable"]).toEqual({ slot: "sword", value: 10 });

      const tex = json("packs/RP/textures/item_texture.json").texture_data;
      expect(tex[`${NS}_fire_sword`]).toEqual({ textures: "textures/items/sword" });
      expect(text("packs/RP/texts/en_US.lang")).toContain(`item.${NS}:fire_sword=Fire Sword`);
      expect(json("packs/RP/texts/languages.json")).toEqual(["en_US"]);
    });

    it("3D: adds attachable + custom render controller, references user geometry, no geo/anim files", () => {
      const { paths, json } = stage(planWeapon, { name: "fire_sword", mode: "3d" });

      expect(paths).toContain("packs/RP/attachables/fire_sword.attachable.json");
      expect(paths).toContain("packs/RP/render_controllers/fire_sword.rc.json");
      expect(paths.some((p) => p.includes("models/"))).toBe(false);
      expect(paths.some((p) => p.includes("animations/"))).toBe(false);
      expect(paths.some((p) => p.endsWith(".geo.json"))).toBe(false);
      expect(paths.some((p) => p.endsWith(".animation.json"))).toBe(false);

      const att = json("packs/RP/attachables/fire_sword.attachable.json")["minecraft:attachable"];
      expect(att.description.identifier).toBe(`${NS}:fire_sword`);
      expect(att.description.geometry.default).toBe(`geometry.${NS}.fire_sword`);
      expect(att.description.render_controllers).toEqual([`controller.render.${NS}_fire_sword`]);

      const rc = json("packs/RP/render_controllers/fire_sword.rc.json");
      expect(rc.format_version).toBe("1.10.0");
      expect(rc.render_controllers[`controller.render.${NS}_fire_sword`]).toBeDefined();
    });
  });

  describe("tool", () => {
    it("pickaxe (default): variant table tags, digger query, diamond tier", () => {
      const { paths, json } = stage(planTool, { name: "ruby_pickaxe", icon: "ruby_pickaxe" });
      expect(paths).toContain("packs/BP/items/ruby_pickaxe.item.json");

      const c = json("packs/BP/items/ruby_pickaxe.item.json")["minecraft:item"].components;
      expect(c["minecraft:icon"]).toBe(`${NS}_ruby_pickaxe`);
      expect(c["minecraft:enchantable"].slot).toBe("pickaxe");
      expect(c["minecraft:digger"].destroy_speeds[0].block.tags).toContain(
        "minecraft:is_pickaxe_item_destructible",
      );
      expect(c["minecraft:tags"].tags).toContain("minecraft:is_pickaxe");
      expect(c["minecraft:tags"].tags).toContain("minecraft:diamond_tier");
      expect(c["minecraft:damage"]).toBe(6);
    });

    it("axe variant swaps the tag/slot/query and default damage", () => {
      const { json } = stage(planTool, { name: "ruby_axe", variant: "axe" });
      const c = json("packs/BP/items/ruby_axe.item.json")["minecraft:item"].components;
      expect(c["minecraft:enchantable"].slot).toBe("axe");
      expect(c["minecraft:tags"].tags).toContain("minecraft:is_axe");
      expect(c["minecraft:digger"].destroy_speeds[0].block.tags).toContain(
        "minecraft:is_axe_item_destructible",
      );
      expect(c["minecraft:damage"]).toBe(7);
    });

    it("rejects an unknown variant", () => {
      const tree = new Tree(fx.config.__configDir);
      expect(() => planTool(tree, fx.config, { name: "x", variant: "sword" })).toThrow(
        GenerateError,
      );
    });
  });

  describe("armor", () => {
    it("chestplate icon mode: enchant slot is armor_torso (NOT armor_chest)", () => {
      const { paths, json } = stage(planArmor, { name: "ruby_chestplate", piece: "chestplate" });
      expect(paths).toEqual([
        "packs/BP/items/ruby_chestplate.item.json",
        "packs/RP/texts/en_US.lang",
        "packs/RP/texts/languages.json",
        "packs/RP/textures/item_texture.json",
      ]);

      const top = json("packs/BP/items/ruby_chestplate.item.json");
      expect(top.format_version).toBe("1.20.80");
      expect(top["minecraft:item"].description.identifier).toBeDefined();
      const c = top["minecraft:item"].components;
      expect(c["minecraft:enchantable"]).toEqual({ value: 9, slot: "armor_torso" });
      expect(c["minecraft:wearable"]).toEqual({ slot: "slot.armor.chest", protection: 6 });
      expect(c["minecraft:durability"].max_durability).toBe(340);
      expect(c["minecraft:icon"]).toBe(`${NS}_ruby_chestplate`);
    });

    it("helmet uses armor_head + its own durability/protection", () => {
      const { json } = stage(planArmor, { name: "ruby_helmet", piece: "helmet" });
      const c = json("packs/BP/items/ruby_helmet.item.json")["minecraft:item"].components;
      expect(c["minecraft:enchantable"].slot).toBe("armor_head");
      expect(c["minecraft:wearable"].slot).toBe("slot.armor.head");
      expect(c["minecraft:durability"].max_durability).toBe(265);
    });

    it("3d mode adds an attachable + render controller, no geo/texture files", () => {
      const { paths, json } = stage(planArmor, {
        name: "ruby_chestplate",
        piece: "chestplate",
        mode: "3d",
      });
      expect(paths).toContain("packs/RP/attachables/ruby_chestplate.attachable.json");
      expect(paths).toContain("packs/RP/render_controllers/ruby_chestplate.rc.json");
      expect(paths.some((p) => p.includes("models/"))).toBe(false);

      const att = json("packs/RP/attachables/ruby_chestplate.attachable.json")[
        "minecraft:attachable"
      ];
      expect(att.description.materials).toEqual({ default: "armor", enchanted: "armor_enchanted" });
      expect(att.description.render_controllers).toEqual([
        `controller.render.${NS}_ruby_chestplate`,
      ]);
    });
  });

  describe("item", () => {
    it("generic item: 64 stack, items category, plain-string icon", () => {
      const { paths, json, text } = stage(planItem, { name: "ruby", icon: "ruby" });
      expect(paths).toEqual([
        "packs/BP/items/ruby.item.json",
        "packs/RP/texts/en_US.lang",
        "packs/RP/texts/languages.json",
        "packs/RP/textures/item_texture.json",
      ]);

      const top = json("packs/BP/items/ruby.item.json");
      expect(top.format_version).toBe("1.21.80");
      expect(top["minecraft:item"].description.menu_category.category).toBe("items");
      expect(top["minecraft:item"].components["minecraft:icon"]).toBe(`${NS}_ruby`);
      expect(top["minecraft:item"].components["minecraft:max_stack_size"]).toBe(64);

      const tex = json("packs/RP/textures/item_texture.json").texture_data;
      expect(tex[`${NS}_ruby`]).toEqual({ textures: "textures/items/ruby" });
      expect(text("packs/RP/texts/en_US.lang")).toContain(`item.${NS}:ruby=Ruby`);
    });

    it("rejects a non-snake_case name", () => {
      rejectsBadName({ name: "Fire Sword" });
      rejectsBadName({ name: "ruby2" });
    });
  });

  describe("entity", () => {
    it("3D: emits BP (entities, plural) + RP client_entity (entity, singular), no geo files", () => {
      const { paths, json, text } = stage(planEntity, { name: "goblin", mode: "3d" });
      expect(paths).toContain("packs/BP/entities/goblin.json");
      expect(paths).toContain("packs/RP/entity/goblin.json");
      expect(paths.some((p) => p.includes("models/"))).toBe(false);
      expect(paths.some((p) => p.endsWith(".geo.json"))).toBe(false);

      const bp = json("packs/BP/entities/goblin.json");
      expect(bp.format_version).toBe("1.21.40");
      expect(bp["minecraft:entity"].description.identifier).toBe(`${NS}:goblin`);
      expect(bp["minecraft:entity"].description.is_summonable).toBe(true);

      const rp = json("packs/RP/entity/goblin.json");
      expect(rp.format_version).toBe("1.10.0");
      expect(rp["minecraft:client_entity"].description.identifier).toBe(`${NS}:goblin`);
      expect(rp["minecraft:client_entity"].description.geometry.default).toBe(
        `geometry.${NS}.goblin`,
      );
      expect(rp["minecraft:client_entity"].description.spawn_egg).toEqual({
        base_color: "#000000",
        overlay_color: "#ffffff",
      });

      expect(text("packs/RP/texts/en_US.lang")).toContain(`entity.${NS}:goblin.name=Goblin`);
      expect(text("packs/RP/texts/en_US.lang")).toContain(
        `item.spawn_egg.entity.${NS}:goblin.name=Spawn Goblin`,
      );
    });

    it("2D: billboard sprite material/geometry/render controller", () => {
      const { json } = stage(planEntity, { name: "wisp", mode: "2d" });
      const desc = json("packs/RP/entity/wisp.json")["minecraft:client_entity"].description;
      expect(desc.materials).toEqual({ default: "snowball" });
      expect(desc.geometry.default).toBe("geometry.item_sprite");
      expect(desc.render_controllers).toEqual(["controller.render.item_sprite"]);
      expect(desc.scripts.animate).toEqual(["flying"]);
    });

    it("spawn egg: writes an egg item wired to the entity", () => {
      const { paths, json, text } = stage(planEntity, { name: "goblin", spawnEgg: true });
      expect(paths).toContain("packs/BP/items/goblin_spawn_egg.item.json");
      const egg = json("packs/BP/items/goblin_spawn_egg.item.json")["minecraft:item"];
      expect(egg.description.identifier).toBe(`${NS}:goblin_spawn_egg`);
      expect(egg.components["minecraft:spawn_egg"]).toEqual({
        entity_identifier: `${NS}:goblin`,
      });
      expect(text("packs/RP/texts/en_US.lang")).toContain(`item.${NS}:goblin_spawn_egg=`);
    });

    it("skips the egg item by default", () => {
      const { paths } = stage(planEntity, { name: "goblin" });
      expect(paths.some((p) => p.includes("spawn_egg") && p.endsWith(".item.json"))).toBe(false);
    });
  });

  describe("block", () => {
    it("emits all four artifacts; block has BOTH geometry + material_instances", () => {
      const { paths, json, text } = stage(planBlock, { name: "ruby_block" });
      expect(paths).toEqual([
        "packs/BP/blocks/ruby_block.block.json",
        "packs/RP/blocks.json",
        "packs/RP/texts/en_US.lang",
        "packs/RP/texts/languages.json",
        "packs/RP/textures/terrain_texture.json",
      ]);

      const top = json("packs/BP/blocks/ruby_block.block.json");
      expect(top.format_version).toBe("1.21.50");
      const c = top["minecraft:block"].components;
      expect(c["minecraft:geometry"]).toBe("minecraft:geometry.full_block");
      expect(c["minecraft:material_instances"]["*"].texture).toBe(`${NS}_ruby_block`);
      expect(c["minecraft:material_instances"]["*"].render_method).toBe("opaque");

      const terrain = json("packs/RP/textures/terrain_texture.json").texture_data;
      expect(terrain[`${NS}_ruby_block`]).toEqual({ textures: "textures/blocks/ruby_block" });

      const blocks = json("packs/RP/blocks.json");
      expect(blocks[`${NS}:ruby_block`]).toEqual({ textures: `${NS}_ruby_block`, sound: "stone" });
      expect(blocks.format_version).toBe("1.10.0");
      expect(text("packs/RP/texts/en_US.lang")).toContain(`tile.${NS}:ruby_block.name=Ruby Block`);
    });

    it("light emission flag adds minecraft:light_emission", () => {
      const { json } = stage(planBlock, { name: "glow_block", light: 12 });
      const c = json("packs/BP/blocks/glow_block.block.json")["minecraft:block"].components;
      expect(c["minecraft:light_emission"]).toBe(12);
    });

    it("rejects an unknown render method", () => {
      const tree = new Tree(fx.config.__configDir);
      expect(() => planBlock(tree, fx.config, { name: "x", renderMethod: "fancy" })).toThrow(
        GenerateError,
      );
    });
  });

  describe("recipe", () => {
    it("shapeless: writes BP/recipes with tags and result", () => {
      const { paths, json } = stage(planRecipe, {
        name: "ruby_sword",
        ingredients: "minecraft:stick,minecraft:diamond",
      });
      expect(paths).toEqual(["packs/BP/recipes/ruby_sword.json"]);
      const top = json("packs/BP/recipes/ruby_sword.json");
      expect(top.format_version).toBe("1.20.10");
      const body = top["minecraft:recipe_shapeless"];
      expect(body.description.identifier).toBe(`${NS}:ruby_sword`);
      expect(body.tags).toEqual(["crafting_table"]);
      expect(body.ingredients).toEqual([
        { item: "minecraft:stick" },
        { item: "minecraft:diamond" },
      ]);
      expect(body.result).toEqual({ item: `${NS}:ruby_sword`, count: 1 });
    });

    it("unlocks on the first ingredient by default", () => {
      const { json } = stage(planRecipe, {
        name: "ruby_sword",
        ingredients: "minecraft:stick,minecraft:diamond",
      });
      const body = json("packs/BP/recipes/ruby_sword.json")["minecraft:recipe_shapeless"];
      expect(body.unlock).toEqual([{ item: "minecraft:stick" }]);
    });

    it("accepts an explicit unlock item or context", () => {
      const { json } = stage(planRecipe, {
        name: "ruby_sword",
        ingredients: "minecraft:stick",
        unlock: "minecraft:diamond",
      });
      expect(json("packs/BP/recipes/ruby_sword.json")["minecraft:recipe_shapeless"].unlock).toEqual(
        [{ item: "minecraft:diamond" }],
      );
      const { json: ctx } = stage(planRecipe, {
        name: "diver_soup",
        ingredients: "minecraft:kelp",
        unlock: "context:player_in_water",
      });
      expect(ctx("packs/BP/recipes/diver_soup.json")["minecraft:recipe_shapeless"].unlock).toEqual([
        { context: "player_in_water" },
      ]);
    });

    it("furnace: writes input plus output on the furnace tag", () => {
      const { json } = stage(planRecipe, {
        name: "smelt_ruby",
        recipeKind: "furnace",
        ingredients: "minecraft:raw_ruby",
        result: "minecraft:ruby",
        count: 1,
      });
      const body = json("packs/BP/recipes/smelt_ruby.json")["minecraft:recipe_furnace"];
      expect(body.tags).toEqual(["furnace"]);
      expect(body.input).toBe("minecraft:raw_ruby");
      expect(body.output).toEqual({ item: "minecraft:ruby", count: 1 });
    });

    it("shaped: writes pattern plus key", () => {
      const { paths, json } = stage(planRecipe, {
        name: "ruby_pickaxe",
        recipeKind: "shaped",
        pattern: "XXX; # ; # ",
        recipeKey: "X=minecraft:diamond,#=minecraft:stick",
      });
      expect(paths).toEqual(["packs/BP/recipes/ruby_pickaxe.json"]);
      const body = json("packs/BP/recipes/ruby_pickaxe.json")["minecraft:recipe_shaped"];
      expect(body.pattern).toEqual(["XXX", " # ", " # "]);
      expect(body.key).toEqual({
        X: { item: "minecraft:diamond" },
        "#": { item: "minecraft:stick" },
      });
    });

    it("shaped rejects a pattern symbol missing from the key", () => {
      const tree = new Tree(fx.config.__configDir);
      expect(() =>
        planRecipe(tree, fx.config, {
          name: "x",
          recipeKind: "shaped",
          pattern: "XY",
          recipeKey: "X=minecraft:stick",
        }),
      ).toThrow(GenerateError);
    });

    it("rejects a bad kind and a non-namespaced result", () => {
      const tree = new Tree(fx.config.__configDir);
      expect(() => planRecipe(tree, fx.config, { name: "x", recipeKind: "fancy" })).toThrow(
        GenerateError,
      );
      expect(() => planRecipe(tree, fx.config, { name: "x", result: "ruby" })).toThrow(
        GenerateError,
      );
    });
  });

  describe("loot", () => {
    it("entity: writes a weighted pool with set_count plus looting", () => {
      const { paths, json } = stage(planLoot, { name: "goblin" });
      expect(paths).toEqual(["packs/BP/loot_tables/entities/goblin.json"]);
      const pool = json("packs/BP/loot_tables/entities/goblin.json").pools[0];
      expect(pool.rolls).toBe(1);
      const entry = pool.entries[0];
      expect(entry.type).toBe("item");
      expect(entry.name).toBe(`${NS}:goblin`);
      expect(entry.functions[0]).toEqual({
        function: "set_count",
        count: { min: 0, max: 1 },
      });
      expect(entry.functions[1].function).toBe("looting_enchant");
    });

    it("block and chest land in their folders", () => {
      const block = stage(planLoot, { name: "ruby_ore", lootKind: "block" });
      expect(block.paths).toEqual(["packs/BP/loot_tables/blocks/ruby_ore.json"]);
      const chest = stage(planLoot, { name: "bonus", lootKind: "chest" });
      expect(chest.paths).toEqual(["packs/BP/loot_tables/chests/bonus.json"]);
    });

    it("rejects min above max", () => {
      const tree = new Tree(fx.config.__configDir);
      expect(() => planLoot(tree, fx.config, { name: "x", min: 3, max: 1 })).toThrow(GenerateError);
    });
  });

  describe("spawn", () => {
    it("writes a surface spawn rule with weight and herd", () => {
      const { paths, json } = stage(planSpawn, { name: "goblin" });
      expect(paths).toEqual(["packs/BP/spawn_rules/goblin.json"]);
      const top = json("packs/BP/spawn_rules/goblin.json");
      expect(top.format_version).toBe("1.17.0");
      const rules = top["minecraft:spawn_rules"];
      expect(rules.description.identifier).toBe(`${NS}:goblin`);
      expect(rules.conditions[0]["minecraft:weight"]).toEqual({ default: 10 });
    });

    it("rejects a bad category", () => {
      const tree = new Tree(fx.config.__configDir);
      expect(() => planSpawn(tree, fx.config, { name: "x", spawnCategory: "boss" })).toThrow(
        GenerateError,
      );
    });
  });

  describe("trade", () => {
    it("writes a single tier with wants and gives", () => {
      const { paths, json } = stage(planTrade, {
        name: "ruby_trade",
        want: "minecraft:emerald",
        give: "minecraft:diamond",
      });
      expect(paths).toEqual(["packs/BP/trading/ruby_trade.json"]);
      const trade = json("packs/BP/trading/ruby_trade.json").tiers[0].trades[0];
      expect(trade.wants[0].item).toBe("minecraft:emerald");
      expect(trade.gives[0].item).toBe("minecraft:diamond");
      expect(trade.max_uses).toBeUndefined();
      expect(trade.trader_exp).toBeUndefined();
    });

    it("adds max uses and xp when asked", () => {
      const { json } = stage(planTrade, {
        name: "ruby_trade",
        want: "minecraft:emerald",
        give: "minecraft:diamond",
        maxUses: 12,
        xp: 5,
      });
      const trade = json("packs/BP/trading/ruby_trade.json").tiers[0].trades[0];
      expect(trade.max_uses).toBe(12);
      expect(trade.trader_exp).toBe(5);
    });
  });

  describe("loot_table", () => {
    it("writes empty pools ready to fill", () => {
      const { paths, json } = stage(planLootTable, { name: "dungeon", pools: 2 });
      expect(paths).toEqual(["packs/BP/loot_tables/chests/dungeon.json"]);
      const pools = json("packs/BP/loot_tables/chests/dungeon.json").pools;
      expect(pools).toHaveLength(2);
      expect(pools[0]).toEqual({
        rolls: 1,
        entries: [{ type: "empty", weight: 1 }],
      });
    });

    it("follows the loot kind folder and rejects bad pool counts", () => {
      const block = stage(planLootTable, { name: "ore", lootKind: "block" });
      expect(block.paths).toEqual(["packs/BP/loot_tables/blocks/ore.json"]);
      const tree = new Tree(fx.config.__configDir);
      expect(() => planLootTable(tree, fx.config, { name: "ore", pools: 0 })).toThrow(
        GenerateError,
      );
    });
  });

  describe("dialogue", () => {
    it("writes an npc scene with text and button", () => {
      const { paths, json } = stage(planDialogue, { name: "greeter" });
      expect(paths).toEqual(["packs/BP/dialogue/greeter.json"]);
      const scene = json("packs/BP/dialogue/greeter.json")["minecraft:npc_dialogue"].scenes[0];
      expect(scene.scene_tag).toBe(`${NS}:greeter`);
      expect(scene.buttons).toHaveLength(1);
    });
  });

  describe("animation", () => {
    it("writes a controller with default and playing states", () => {
      const { paths, json } = stage(planAnimation, { name: "goblin" });
      expect(paths).toEqual(["packs/RP/animation_controllers/goblin.json"]);
      const controllers = json("packs/RP/animation_controllers/goblin.json").animation_controllers;
      expect(controllers[`controller.animation.${NS}.goblin`]).toBeDefined();
    });
  });

  describe("equipment", () => {
    it("writes an equipment loot table with a chance condition", () => {
      const { paths, json } = stage(planEquipment, { name: "goblin" });
      expect(paths).toEqual(["packs/BP/loot_tables/entities/goblin_equipment.json"]);
      const pool = json("packs/BP/loot_tables/entities/goblin_equipment.json").pools[0];
      expect(pool.conditions[0].condition).toBe("random_chance");
      expect(pool.entries[0].name).toBe(`${NS}:goblin`);
    });
  });

  describe("feature", () => {
    it("writes an ore feature", () => {
      const { paths, json } = stage(planFeature, { name: "ruby_ore" });
      expect(paths).toEqual(["packs/BP/features/ruby_ore.json"]);
      const feat = json("packs/BP/features/ruby_ore.json")["minecraft:ore_feature"];
      expect(feat.description.identifier).toBe(`${NS}:ruby_ore`);
      expect(feat.count).toBe(10);
    });
  });

  describe("feature_rule", () => {
    it("writes a feature rule placing the feature", () => {
      const { paths, json } = stage(planFeatureRule, { name: "ruby_ore" });
      expect(paths).toEqual(["packs/BP/feature_rules/ruby_ore.json"]);
      const rule = json("packs/BP/feature_rules/ruby_ore.json")["minecraft:feature_rules"];
      expect(rule.description.places_feature).toBe(`${NS}:ruby_ore`);
      expect(rule.distribution.y).toBe(90);
    });
  });

  describe("particle", () => {
    it("writes a particle effect to RP", () => {
      const { paths, json } = stage(planParticle, { name: "spark" });
      expect(paths).toEqual(["packs/RP/particles/spark.json"]);
      expect(json("packs/RP/particles/spark.json").particle_effect.description.identifier).toBe(
        `${NS}:spark`,
      );
    });
  });

  describe("fog", () => {
    it("writes fog settings with color and distance", () => {
      const { paths, json } = stage(planFog, { name: "swamp", color: "#112233", min: 5, max: 40 });
      expect(paths).toEqual(["packs/RP/fogs/swamp.json"]);
      const air = json("packs/RP/fogs/swamp.json")["minecraft:fog_settings"].distance.air;
      expect(air.fog_color).toBe("#112233");
      expect(air.fog_end).toBe(40);
    });
  });

  describe("function", () => {
    it("writes a plain mcfunction body", () => {
      const { paths, text } = stage(planFunction, { name: "greet", commandLine: "say hi" });
      expect(paths).toEqual(["packs/BP/functions/greet.mcfunction"]);
      expect(text("packs/BP/functions/greet.mcfunction")).toBe("say hi\n");
    });
  });

  describe("voxel_shape", () => {
    it("writes a voxel shape with one box", () => {
      const { paths, json } = stage(planVoxelShape, { name: "slab", count: 8 });
      expect(paths).toEqual(["packs/BP/voxel_shapes/slab.json"]);
      const shape = json("packs/BP/voxel_shapes/slab.json")["minecraft:voxel_shape"].shape;
      expect(shape.boxes[0].max[1]).toBe(8);
    });

    it("rejects a max Y above 16", () => {
      const tree = new Tree(fx.config.__configDir);
      expect(() => planVoxelShape(tree, fx.config, { name: "x", count: 20 })).toThrow(
        GenerateError,
      );
    });
  });

  describe("biome", () => {
    it("writes a client biome with water and fog", () => {
      const { paths, json } = stage(planBiome, { name: "swamp", color: "#334455" });
      expect(paths).toEqual(["packs/RP/biomes/swamp.json"]);
      const c = json("packs/RP/biomes/swamp.json")["minecraft:client_biome"].components;
      expect(c["minecraft:water_appearance"].surface_color).toBe("#334455");
      expect(c["minecraft:fog_appearance"].fog_identifier).toBe(`minecraft:fog_swamp`);
    });
  });

  describe("camera", () => {
    it("writes a camera preset with position", () => {
      const { paths, json } = stage(planCamera, { name: "intro", x: 1, y: 2, z: 3 });
      expect(paths).toEqual(["packs/BP/cameras/presets/intro.json"]);
      const preset = json("packs/BP/cameras/presets/intro.json")["minecraft:camera_preset"];
      expect(preset.pos_x).toBe(1);
      expect(preset.pos_z).toBe(3);
    });
  });

  describe("item_catalog", () => {
    it("writes a catalog group", () => {
      const { paths, json } = stage(planItemCatalog, { name: "gems", category: "items" });
      expect(paths).toEqual(["packs/BP/item_catalog/gems.json"]);
      const cats = json("packs/BP/item_catalog/gems.json")["minecraft:crafting_items_catalog"]
        .categories;
      expect(cats[0].category_name).toBe("items");
    });
  });

  describe("sound", () => {
    it("merges a sound definition into sound_definitions.json", () => {
      const { paths, json } = stage(planSound, {
        name: "hit",
        result: "custom.hit",
        soundFile: "sounds/hit",
      });
      expect(paths).toEqual(["packs/RP/sounds/sound_definitions.json"]);
      const defs = json("packs/RP/sounds/sound_definitions.json").sound_definitions;
      expect(defs["custom.hit"].sounds[0].name).toBe("sounds/hit");
    });
  });

  describe("biomes_client", () => {
    it("merges a biome row into biomes_client.json", () => {
      const { paths, json } = stage(planBiomesClient, { name: "swamp", color: "#445566" });
      expect(paths).toEqual(["packs/RP/biomes_client.json"]);
      const biomes = json("packs/RP/biomes_client.json").biomes;
      expect(biomes[`${NS}:swamp`].water_surface_color).toBe("#445566");
    });
  });

  describe("block_culling", () => {
    it("writes a culling rule", () => {
      const { paths, json } = stage(planBlockCulling, { name: "slab", direction: "down" });
      expect(paths).toEqual(["packs/RP/block_culling/slab.json"]);
      const rule = json("packs/RP/block_culling/slab.json")["minecraft:block_culling_rules"]
        .rules[0];
      expect(rule.direction).toBe("down");
    });

    it("rejects a bad direction", () => {
      const tree = new Tree(fx.config.__configDir);
      expect(() => planBlockCulling(tree, fx.config, { name: "x", direction: "sideways" })).toThrow(
        GenerateError,
      );
    });
  });

  describe("dimension", () => {
    it("writes a dimension with bounds and generator", () => {
      const { paths, json } = stage(planDimension, { name: "void_arena" });
      expect(paths).toEqual(["packs/BP/dimensions/void_arena.json"]);
      const dim = json("packs/BP/dimensions/void_arena.json")["minecraft:dimension"];
      expect(dim.description.identifier).toBe(`${NS}:void_arena`);
      expect(dim.components["minecraft:generation"].generator_type).toBe("void");
      expect(dim.components["minecraft:dimension_height"].min_y).toBe(-64);
    });

    it("rejects a height that overflows the world limit", () => {
      const tree = new Tree(fx.config.__configDir);
      expect(() => planDimension(tree, fx.config, { name: "x", min: 400, count: 384 })).toThrow(
        GenerateError,
      );
    });
  });

  describe("ui", () => {
    it("writes a screen and registers it in _ui_defs", () => {
      const { paths, json } = stage(planUi, { name: "hud" });
      expect(paths).toContain("packs/RP/ui/hud.json");
      expect(paths).toContain("packs/RP/ui/_ui_defs.json");
      const defs = json("packs/RP/ui/_ui_defs.json").ui_defs;
      expect(defs).toContain("ui/hud.json");
    });
  });

  describe("companions", () => {
    it("item with --recipe writes the feature plus the recipe", () => {
      const { paths } = stage(planItem, { name: "ruby", recipe: "shapeless" });
      expect(paths).toContain("packs/BP/items/ruby.item.json");
      expect(paths).toContain("packs/BP/recipes/ruby.json");
    });

    it("block with --loot writes the feature plus the loot table", () => {
      const { paths } = stage(planBlock, { name: "ruby_block", loot: "block" });
      expect(paths).toContain("packs/BP/blocks/ruby_block.block.json");
      expect(paths).toContain("packs/BP/loot_tables/blocks/ruby_block.json");
    });

    it("entity with --loot writes the pair plus the loot table", () => {
      const { paths } = stage(planEntity, { name: "goblin", loot: "entity" });
      expect(paths).toContain("packs/BP/entities/goblin.json");
      expect(paths).toContain("packs/BP/loot_tables/entities/goblin.json");
    });

    it("entity with --equipment writes the table and wires the component", () => {
      const { paths, json } = stage(planEntity, { name: "goblin", equipment: "mainhand" });
      expect(paths).toContain("packs/BP/loot_tables/entities/goblin_equipment.json");
      const c = json("packs/BP/entities/goblin.json")["minecraft:entity"].components;
      expect(c["minecraft:equipment"]).toEqual({
        table: "loot_tables/entities/goblin_equipment.json",
      });
    });
  });

  describe("plan classification", () => {
    it("re-running a planner against flushed output classifies everything as skip", async () => {
      const first = new Tree(fx.config.__configDir);
      planBlock(first, fx.config, { name: "ruby_block" });
      await first.flush();

      const second = new Tree(fx.config.__configDir);
      planBlock(second, fx.config, { name: "ruby_block" });
      expect(planTree(second, false).every((f) => f.status === "skip")).toBe(true);
    });
  });
});
