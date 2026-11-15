import { describe, expect, it } from "vitest";

import factory from "../extensions/spawn-egg-generator/index.mjs";

const ext = factory({ settings: {} });
const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
const decode = (bytes: Uint8Array | null): string => new TextDecoder().decode(bytes!);
const bp = (rel: string): never => ({ kind: "BP", rel }) as never;
const rp = (rel: string): never => ({ kind: "RP", rel }) as never;
const ctx = { release: false };

function entity(id: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    format_version: "1.21.0",
    "minecraft:entity": { description: { identifier: id, ...extra } },
  });
}

function clientEntity(id: string): string {
  return JSON.stringify({
    format_version: "1.10.0",
    "minecraft:client_entity": { description: { identifier: id } },
  });
}

describe("spawn-egg-generator extension", () => {
  it("matches bp entities and rp client entities only", () => {
    expect(ext.match(bp("entities/wisp.json"))).toBe(true);
    expect(ext.match(rp("entity/wisp.entity.json"))).toBe(true);
    expect(ext.match(bp("items/wisp.json"))).toBe(false);
    expect(ext.match(rp("textures/wisp.png"))).toBe(false);
  });

  it("never modifies source files", async () => {
    const out = await ext.transform!(encode(entity("test:wisp")), bp("entities/wisp.json"), ctx);
    expect(out).toBeNull();
  });

  it("emits a client entity with spawn egg colors", async () => {
    const scoped = factory({ settings: { baseColor: "#ff0000", overlayColor: "#00ff00" } });
    await scoped.transform!(encode(entity("test:wisp")), bp("entities/wisp.json"), ctx);
    const emitted = await scoped.emit!(ctx);
    expect(emitted).toHaveLength(1);
    expect(emitted![0]!.kind).toBe("RP");
    expect(emitted![0]!.rel).toBe("entity/wisp.entity.json");
    const doc = JSON.parse(decode(emitted![0]!.content));
    expect(doc["minecraft:client_entity"].description.identifier).toBe("test:wisp");
    expect(doc["minecraft:client_entity"].description.spawn_egg).toEqual({
      base_color: "#ff0000",
      overlay_color: "#00ff00",
    });
  });

  it("skips entities that already have a client entity", async () => {
    await ext.transform!(encode(entity("test:covered")), bp("entities/covered.json"), ctx);
    await ext.transform!(
      encode(clientEntity("test:covered")),
      rp("entity/covered.entity.json"),
      ctx,
    );
    const emitted = (await ext.emit!(ctx)) ?? [];
    expect(emitted.some((file) => file.rel === "entity/covered.entity.json")).toBe(false);
  });

  it("skips non-spawnable entities and vanilla ids", async () => {
    const scoped = factory({ settings: {} });
    await scoped.transform!(
      encode(entity("test:hidden", { is_spawnable: false })),
      bp("entities/hidden.json"),
      ctx,
    );
    await scoped.transform!(encode(entity("minecraft:pig")), bp("entities/pig.json"), ctx);
    expect(await scoped.emit!(ctx)).toEqual([]);
  });

  it("falls back to default colors on bad settings", async () => {
    const scoped = factory({ settings: { baseColor: "red", overlayColor: null } });
    await scoped.transform!(encode(entity("test:wisp")), bp("entities/wisp.json"), ctx);
    const emitted = await scoped.emit!(ctx);
    const doc = JSON.parse(decode(emitted![0]!.content));
    expect(doc["minecraft:client_entity"].description.spawn_egg).toEqual({
      base_color: "#a0a0a0",
      overlay_color: "#505050",
    });
  });
});
