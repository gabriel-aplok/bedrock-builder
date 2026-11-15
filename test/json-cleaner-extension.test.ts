import { describe, expect, it } from "vitest";

import factory from "../extensions/json-cleaner/index.mjs";

const encode = (text: string) => new TextEncoder().encode(text);
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("json-cleaner extension", () => {
  it("strips comments and schemas", () => {
    const extension = factory({ settings: { stripSchemas: true, minify: false } });
    const output = extension.transform(encode('{\n  "$schema": "x",\n  // note\n  "a": 1\n}\n'), {
      rel: "entities/a.json",
    });

    expect(output).not.toBeNull();
    const text = decode(output);
    expect(text).not.toContain("$schema");
    expect(text).not.toContain("// note");
    expect(JSON.parse(text)).toEqual({ a: 1 });
  });

  it("leaves non-json files alone", () => {
    const extension = factory({ settings: {} });
    expect(extension.match({ rel: "texts/en_US.lang" })).toBe(false);
  });
});
