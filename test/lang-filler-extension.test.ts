import { describe, expect, it } from "vitest";

import factory from "../extensions/lang-gap-filler/index.mjs";

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);
const lang = (rel: string): never => ({ kind: "RP", rel }) as never;
const ctx = { release: false };

const EN = "entity.test:wisp.name=Wisp\nitem.test:gem.name=Gem\n";
const ES = "# spanish\nentity.test:wisp.name=Fuego fatuo\n";

describe("lang-gap-filler extension", () => {
  it("matches lang files only", () => {
    const ext = factory({ settings: {} });
    expect(ext.match(lang("texts/en_US.lang"))).toBe(true);
    expect(ext.match(lang("texts/en_US.json"))).toBe(false);
  });

  it("never modifies source files", async () => {
    const ext = factory({ settings: {} });
    const out = await ext.transform!(encode(EN), lang("texts/en_US.lang"), ctx);
    expect(out).toBeNull();
  });

  it("emits a gaps report without fill", async () => {
    const ext = factory({ settings: {} });
    await ext.transform!(encode(EN), lang("texts/en_US.lang"), ctx);
    await ext.transform!(encode(ES), lang("texts/es_ES.lang"), ctx);
    const emitted = await ext.emit!(ctx);
    expect(emitted).toHaveLength(1);
    expect(emitted![0]!.rel).toBe("texts/__lang_gaps.json");
    const report = JSON.parse(decode(emitted![0]!.content));
    expect(report.gaps).toEqual([
      { file: "texts/es_ES.lang", language: "es_ES", missing: ["item.test:gem.name"] },
    ]);
  });

  it("emits completed files with fill", async () => {
    const ext = factory({ settings: { fill: true } });
    await ext.transform!(encode(EN), lang("texts/en_US.lang"), ctx);
    await ext.transform!(encode(ES), lang("texts/es_ES.lang"), ctx);
    const emitted = (await ext.emit!(ctx)) ?? [];
    const filled = emitted.find((file) => file.rel === "texts/es_ES.lang");
    expect(filled).toBeDefined();
    expect(decode(filled!.content)).toContain("item.test:gem.name=Gem");
    expect(decode(filled!.content)).toContain("# filled by lang-gap-filler");
  });

  it("emits nothing when nothing is missing", async () => {
    const ext = factory({ settings: { fill: true } });
    await ext.transform!(encode(EN), lang("texts/en_US.lang"), ctx);
    await ext.transform!(encode(EN), lang("texts/es_ES.lang"), ctx);
    expect(await ext.emit!(ctx)).toEqual([]);
  });

  it("emits nothing without a default language file", async () => {
    const ext = factory({ settings: {} });
    await ext.transform!(encode(ES), lang("texts/es_ES.lang"), ctx);
    expect(await ext.emit!(ctx)).toEqual([]);
  });
});
