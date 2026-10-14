import { describe, expect, it } from "vitest";

import { findLangDuplicates, langKeyAt, parseLang, translateKeyAt } from "../src/lang.js";

describe("lang files", () => {
  it("parses key=value lines with positions", () => {
    const { entries, problems } = parseLang(
      "## comment\npack.name=My Pack\n\ntile.dirt.name=Dirt\n",
    );
    expect(problems).toEqual([]);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ key: "pack.name", value: "My Pack", line: 1 });
    expect(entries[1]).toMatchObject({ key: "tile.dirt.name", value: "Dirt", line: 3 });
  });

  it("keeps value spacing and splits on the first =", () => {
    const { entries } = parseLang("a=b=c\nk=  spaced\n");
    expect(entries[0]).toMatchObject({ value: "b=c" });
    expect(entries[1]).toMatchObject({ value: "  spaced" });
  });

  it("reports malformed lines", () => {
    const { entries, problems } = parseLang("no separator\n=empty\nok=1\n");
    expect(entries).toHaveLength(1);
    expect(problems.map((hit) => hit.message)).toEqual(["expected key=value", "empty lang key"]);
  });

  it("finds duplicate keys across files", () => {
    const groups = findLangDuplicates([
      { id: "en", text: "a=1\nb=2\n" },
      { id: "de", text: "a=1\nc=3\n" },
    ]);
    expect(groups).toEqual([{ key: "a", ids: ["en", "de"] }]);
  });

  it("finds duplicate keys within one file", () => {
    const groups = findLangDuplicates([{ id: "en", text: "a=1\na=2\n" }]);
    expect(groups).toEqual([{ key: "a", ids: ["en"] }]);
  });

  it("handles crlf and indented keys", () => {
    const { entries, problems } = parseLang("  pack.name=Hi\r\n## c\r\n");
    expect(problems).toEqual([]);
    expect(entries[0]).toMatchObject({ key: "pack.name", value: "Hi", line: 0, keyStart: 2 });
  });

  it("finds the key under the cursor", () => {
    expect(langKeyAt("tile.dirt.name=Dirt", 4)).toBe("tile.dirt.name");
    expect(langKeyAt("tile.dirt.name=Dirt", 16)).toBeNull();
    expect(langKeyAt("## comment", 2)).toBeNull();
  });

  it("finds translate keys in json lines", () => {
    const line = '"translate": "tile.dirt.name"';
    expect(translateKeyAt(line, 16)).toBe("tile.dirt.name");
    expect(translateKeyAt(line, 2)).toBeNull();
    expect(translateKeyAt('"name": "Dirt"', 8)).toBeNull();
  });
});
