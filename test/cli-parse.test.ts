import { describe, expect, it } from "vitest";

import { parseArgs } from "../src/cli.js";

describe("parseArgs ,  new command", () => {
  it("captures `new weapon fire_sword --icon sword`", () => {
    const got = parseArgs(["new", "weapon", "fire_sword", "--icon", "sword"]);
    expect(got.command).toBe("new");
    expect(got.type).toBe("weapon");
    expect(got.genName).toBe("fire_sword");
    expect(got.icon).toBe("sword");
    expect(got.unknown).toEqual([]);
    expect(got.extraPositionals).toEqual([]);
  });

  it("captures `new weapon fire_sword --mode 3d`", () => {
    const got = parseArgs(["new", "weapon", "fire_sword", "--mode", "3d"]);
    expect(got.type).toBe("weapon");
    expect(got.genName).toBe("fire_sword");
    expect(got.mode).toBe("3d");
  });

  it("accepts the type with no name (interactive will prompt)", () => {
    const got = parseArgs(["new", "block"]);
    expect(got.command).toBe("new");
    expect(got.type).toBe("block");
    expect(got.genName).toBeUndefined();
    expect(got.extraPositionals).toEqual([]);
  });

  it("parses boolean generator flags", () => {
    const got = parseArgs(["new", "item", "ruby", "--force", "--dry-run", "-y"]);
    expect(got.force).toBe(true);
    expect(got.dryRun).toBe(true);
    expect(got.yes).toBe(true);
    expect(got.unknown).toEqual([]);
  });

  it("parses --from, --spawn-egg, --unlock, --max-uses, --xp, --pools", () => {
    const got = parseArgs([
      "new",
      "item",
      "ruby",
      "--from",
      "./sword.json",
      "--spawn-egg",
      "--unlock",
      "minecraft:stick",
      "--max-uses",
      "12",
      "--xp",
      "5",
      "--pools",
      "3",
    ]);
    expect(got.from).toBe("./sword.json");
    expect(got.spawnEgg).toBe(true);
    expect(got.unlock).toBe("minecraft:stick");
    expect(got.maxUses).toBe("12");
    expect(got.xp).toBe("5");
    expect(got.pools).toBe("3");
    expect(got.unknown).toEqual([]);
  });

  it("parses new --list without a type", () => {
    const got = parseArgs(["new", "--list"]);
    expect(got.command).toBe("new");
    expect(got.list).toBe(true);
    expect(got.unknown).toEqual([]);
  });

  it("supports --name as an alias/override", () => {
    const got = parseArgs(["new", "item", "--name", "ruby"]);
    expect(got.type).toBe("item");
    expect(got.genName).toBeUndefined();
    expect(got.name).toBe("ruby");
  });

  it("rejects a THIRD positional after new <type> <name>", () => {
    const got = parseArgs(["new", "weapon", "fire_sword", "extra"]);
    expect(got.type).toBe("weapon");
    expect(got.genName).toBe("fire_sword");
    expect(got.extraPositionals).toEqual(["extra"]);
  });

  it("parses numeric flags as strings (converted at dispatch)", () => {
    const got = parseArgs(["new", "weapon", "fire_sword", "--damage", "9", "--durability", "2000"]);
    expect(got.damage).toBe("9");
    expect(got.durability).toBe("2000");
  });

  it("supports --flag=value form for generator flags", () => {
    const got = parseArgs(["new", "tool", "ruby_pickaxe", "--variant=pickaxe", "--tier=iron"]);
    expect(got.variant).toBe("pickaxe");
    expect(got.tier).toBe("iron");
  });
});

describe("parseArgs ,  generator-flag scoping", () => {
  it("rejects a generator value-flag on a non-new command", () => {
    const got = parseArgs(["build", "--piece", "chestplate"]);
    expect(got.command).toBe("build");
    // lands in unknown so it errors instead of being swallowed.
    expect(got.unknown).toContain("--piece");
  });

  it("rejects a generator boolean-flag on a non-new command", () => {
    const got = parseArgs(["build", "--dry-run"]);
    expect(got.command).toBe("build");
    expect(got.unknown).toContain("--dry-run");
  });

  it("rejects --force on run (would otherwise mask a typo)", () => {
    const got = parseArgs(["run", "--force"]);
    expect(got.unknown).toContain("--force");
  });

  it("still parses shared flags normally on non-new commands", () => {
    const got = parseArgs(["run", "--watch", "--release"]);
    expect(got.command).toBe("run");
    expect(got.watch).toBe(true);
    expect(got.release).toBe(true);
    expect(got.unknown).toEqual([]);
  });

  it("does not let other commands swallow `--piece` value as a positional", () => {
    const got = parseArgs(["build", "--piece", "chestplate"]);
    // chestplate stays the flag value, never an extra positional.
    expect(got.extraPositionals).toEqual([]);
    expect(got.unknown).toContain("--piece");
  });

  it("rejects old names as unknown commands", () => {
    expect(parseArgs(["deploy"]).extraPositionals).toEqual(["deploy"]);
    expect(parseArgs(["create"]).extraPositionals).toEqual(["create"]);
  });

  it("parses run --world as a value flag", () => {
    const got = parseArgs(["run", "--world", "Survival"]);
    expect(got.command).toBe("run");
    expect(got.world).toBe("Survival");
    expect(got.unknown).toEqual([]);
  });
});
