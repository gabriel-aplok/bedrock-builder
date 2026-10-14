import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { build } from "../src/commands/build.js";
import { harness } from "../src/commands/harness.js";
import { clearProcessors, loadExtensions } from "../src/index.js";
import factory from "../extensions/json-obfuscator/index.mjs";
import { setupFixture } from "./helpers.js";
const ext = factory({ settings: {} });
const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
const decode = (bytes: Uint8Array | null): string => new TextDecoder().decode(bytes!);
const file = (rel: string): never => ({ rel }) as never;
const ctx = { release: false };

describe("json-obfuscator extension", () => {
  it("matches json files only", () => {
    expect(ext.match({ rel: "packs/BP/entities/pig.json" } as never)).toBe(true);
    expect(ext.match({ rel: "packs/BP/scripts/main.js" } as never)).toBe(false);
  });

  it("escapes strings but keeps parsed values identical", async () => {
    const input = `{"format_version": "1.10.0", "name": "pig", "count": 3}`;
    const out = await ext.transform!(encode(input), file("packs/BP/entities/pig.json"), ctx);
    expect(out).not.toBeNull();
    const text = decode(out);
    expect(text).toContain("\\u");
    expect(JSON.parse(text)).toEqual(JSON.parse(input));
  });

  it("leaves format_version key and value literal", async () => {
    const out = await ext.transform!(
      encode(`{"format_version": "1.10.0", "name": "pig"}`),
      file("packs/BP/entities/pig.json"),
      ctx,
    );
    const text = decode(out);
    expect(text).toContain(`"format_version": "1.10.0"`);
    expect(text).toContain("\\u");
  });

  it("never touches manifest files", async () => {
    const out = await ext.transform!(
      encode(`{"header": {"name": "pack"}}`),
      file("packs/BP/manifest.json"),
      ctx,
    );
    expect(out).toBeNull();
  });

  it("respects include and exclude globs", async () => {
    const scoped = factory({ settings: { include: ["**/texts/**"], exclude: ["**/*.lang"] } });
    const input = encode(`{"key": "value"}`);
    const kept = await scoped.transform!(input, file("packs/RP/texts/en_US.lang"), ctx);
    expect(kept).toBeNull();
    const done = await scoped.transform!(input, file("packs/RP/texts/languages.json"), ctx);
    expect(done).not.toBeNull();
    expect(JSON.parse(decode(done))).toEqual({ key: "value" });
  });

  it("round-trips surrogate pairs", async () => {
    const input = `{"name": "pig \\uD83D\\uDE00"}`;
    const out = await ext.transform!(encode(input), file("a.json"), ctx);
    expect(JSON.parse(decode(out))).toEqual(JSON.parse(input));
  });

  it("minifies when asked and pretty-prints by default", async () => {
    const input = `{"a": "b"}`;
    const pretty = decode(await ext.transform!(encode(input), file("a.json"), ctx));
    expect(pretty).toContain("\n");
    const tiny = factory({ settings: { minify: true } });
    const flat = decode(await tiny.transform!(encode(input), file("a.json"), ctx));
    expect(flat).not.toContain("\n");
    expect(JSON.parse(flat)).toEqual({ a: "b" });
  });

  it("leaves invalid json alone", async () => {
    const out = await ext.transform!(encode(`{nope`), file("a.json"), ctx);
    expect(out).toBeNull();
  });

  it("escapes symbols without breaking structure", async () => {
    const input = {
      quote: 'say "hi"',
      slash: "a\\b",
      newline: "one\ntwo",
      tab: "x\ty",
      control: "ab",
      empty: "",
      snowman: "☃",
      nested: { deep: ['q"q', ""] },
    };
    const out = await ext.transform!(encode(JSON.stringify(input)), file("a.json"), ctx);
    expect(out).not.toBeNull();
    const text = decode(out);
    expect(text).not.toContain('"hi"');
    expect(JSON.parse(text)).toEqual(input);
  });
});

describe("json-obfuscator pipeline", () => {
  beforeEach(() => clearProcessors());
  afterEach(() => clearProcessors());

  it("builds escaped packs that still parse to the same values", async () => {
    const fixture = await setupFixture();
    try {
      const root = fileURLToPath(new URL(".", import.meta.url));
      const entry = join(root, "..", "extensions", "json-obfuscator");
      const config = {
        ...fixture.config,
        extensions: [{ name: entry, settings: { minify: true } }],
      };
      const report = await loadExtensions(config);
      expect(report.loaded).toBe(1);
      await build(config, { release: false });
      const rel = join("packs", "BP", "items", "example.item.json");
      const source = JSON.parse(await readFile(join(fixture.root, rel), "utf8"));
      const text = await readFile(join(fixture.root, "dist", rel), "utf8");
      expect(text).toContain("\\u");
      expect(JSON.parse(text)).toEqual(source);
      const checked = await harness(config, { build: false });
      expect(checked.failures).toEqual([]);
    } finally {
      await fixture.cleanup();
    }
  });
});
