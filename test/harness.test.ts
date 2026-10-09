import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
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

// smallest valid rgba png, exact bytes for dimension tests.
function tinyPng(width: number, height: number): Buffer {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  const crc = (bytes: Buffer): number => {
    let c = -1;
    for (const byte of bytes) c = table[(c ^ byte) & 0xff]! ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
  const chunk = (type: string, data: Buffer): Buffer => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, "ascii");
    data.copy(out, 8);
    out.writeUInt32BE(crc(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y++) {
    rows.push(Buffer.from([0, ...Buffer.alloc(width * 4, 255)]));
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
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
  await mkdir(join(out, "packs", "RP", "textures", "items"), { recursive: true });
  await writeFile(join(out, "packs", "RP", "textures", "items", "ruby.png"), tinyPng(16, 16));
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
    await writeFile(join(out, "packs", "BP", "pack_icon.png"), tinyPng(64, 64));
    await writeFile(join(out, "packs", "RP", "pack_icon.png"), tinyPng(64, 64));
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
    await writeFile(join(out, "packs", "BP", "pack_icon.png"), tinyPng(64, 64));
    await writeFile(join(out, "packs", "RP", "pack_icon.png"), tinyPng(64, 64));
    await writeFile(
      join(out, "packs", "RP", "texts", "en_US.lang"),
      "test_ruby=Ruby\npack.old=Old\n",
    );
    const result = await harnessCheck(out, { strict: true });
    expect(result.failures.some((f) => f.message.includes('unused lang key "pack.old"'))).toBe(
      true,
    );
  });

  it("flags an atlas texture without a file in strict mode", async () => {
    const out = await tempOut();
    await seedValid(out);
    await rm(join(out, "packs", "RP", "textures", "items", "ruby.png"));
    const lax = await harnessCheck(out);
    expect(lax.failures).toEqual([]);
    const strict = await harnessCheck(out, { strict: true });
    expect(
      strict.failures.some((f) => f.message.includes('atlas texture "textures/items/ruby"')),
    ).toBe(true);
  });

  it("flags non-power-of-two pngs in strict mode only", async () => {
    const out = await tempOut();
    await seedValid(out);
    await writeFile(join(out, "packs", "RP", "textures", "odd.png"), tinyPng(100, 16));
    const lax = await harnessCheck(out);
    expect(lax.failures).toEqual([]);
    const strict = await harnessCheck(out, { strict: true });
    expect(strict.failures.some((f) => f.message.includes("100x16 is not power-of-two"))).toBe(
      true,
    );
  });

  it("flags oversized pngs in strict mode", async () => {
    const out = await tempOut();
    await seedValid(out);
    await writeFile(join(out, "packs", "RP", "textures", "huge.png"), tinyPng(2048, 16));
    const strict = await harnessCheck(out, { strict: true });
    expect(strict.failures.some((f) => f.message.includes("exceeds 1024px"))).toBe(true);
  });

  it("flags unreadable pngs in strict mode", async () => {
    const out = await tempOut();
    await seedValid(out);
    await writeFile(join(out, "packs", "RP", "textures", "broken.png"), "not a png");
    const strict = await harnessCheck(out, { strict: true });
    expect(strict.failures.some((f) => f.message.includes("not a readable png"))).toBe(true);
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
