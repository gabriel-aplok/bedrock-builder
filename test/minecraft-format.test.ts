import { describe, expect, it } from "vitest";

import {
  hoverCodeAt,
  minecraftColorOf,
  minecraftNameOf,
  parseMinecraftLine,
} from "../src/minecraft-format.js";

describe("minecraft format codes", () => {
  it("maps base colors to bedrock hex values", () => {
    expect(minecraftColorOf("a")).toBe("#54FF54");
    expect(minecraftColorOf("7")).toBe("#C5C5C5");
    expect(minecraftColorOf("9")).toBe("#447FFF");
    expect(minecraftColorOf("C")).toBe("#FF5454");
  });

  it("maps extended bedrock material colors", () => {
    expect(minecraftColorOf("g")).toBe("#EFCE16");
    expect(minecraftColorOf("s")).toBe("#5FECFF");
    expect(minecraftColorOf("w")).toBe("#8BB3FF");
    expect(minecraftNameOf("q")).toBe("emerald");
  });

  it("colors spans and resets on §r", () => {
    const spans = parseMinecraftLine("§aHello §cWorld§r!");
    expect(spans).toHaveLength(2);
    expect(spans[0]).toMatchObject({ start: 2, end: 8, color: "#54FF54" });
    expect(spans[1]).toMatchObject({ start: 10, end: 15, color: "#FF5454" });
  });

  it("keeps bold across color changes", () => {
    const spans = parseMinecraftLine("§l§aBold §cStill bold§r plain");
    expect(spans).toHaveLength(2);
    expect(spans[0]).toMatchObject({ color: "#54FF54", bold: true });
    expect(spans[1]).toMatchObject({ color: "#FF5454", bold: true });
  });

  it("ignores unknown codes and stray markers", () => {
    expect(parseMinecraftLine("§zplain§")).toEqual([]);
    expect(parseMinecraftLine("no codes")).toEqual([]);
  });

  it("leaves unknown markers unstyled inside colored text", () => {
    const spans = parseMinecraftLine("§aHi §z there");
    expect(spans).toHaveLength(2);
    expect(spans[0]).toMatchObject({ start: 2, end: 5, color: "#54FF54" });
    expect(spans[1]).toMatchObject({ start: 7, end: 13, color: "#54FF54" });
  });

  it("finds the code under the cursor for hover", () => {
    expect(hoverCodeAt("§aHi", 0)).toBe("a");
    expect(hoverCodeAt("§aHi", 1)).toBe("a");
    expect(hoverCodeAt("§aHi", 3)).toBeUndefined();
    expect(hoverCodeAt("no codes", 2)).toBeUndefined();
  });

  it("supports every bedrock color code in both cases", () => {
    const expected: Record<string, string> = {
      "0": "#000000",
      "1": "#0000AA",
      "2": "#00AA00",
      "3": "#00AAAA",
      "4": "#AA0000",
      "5": "#AA00AA",
      "6": "#FFAA00",
      "7": "#C5C5C5",
      "8": "#545454",
      "9": "#447FFF",
      a: "#54FF54",
      b: "#54FFFF",
      c: "#FF5454",
      d: "#FF54FF",
      e: "#FFFF54",
      f: "#FFFFFF",
      g: "#EFCE16",
      h: "#D9CCB8",
      i: "#A9B4B7",
      j: "#8F727D",
      m: "#EE222C",
      n: "#C87363",
      p: "#FFBF1E",
      q: "#13A045",
      s: "#5FECFF",
      t: "#577BFF",
      u: "#B66CDD",
      v: "#FF6A00",
      w: "#8BB3FF",
    };
    expect(Object.keys(expected)).toHaveLength(29);
    for (const [code, hex] of Object.entries(expected)) {
      expect(minecraftColorOf(code)).toBe(hex);
      expect(minecraftColorOf(code.toUpperCase())).toBe(hex);
      expect(minecraftNameOf(code)).toBeTruthy();
      const spans = parseMinecraftLine(`§${code}x`);
      expect(spans).toEqual([
        { start: 2, end: 3, color: hex, bold: false, italic: false, obfuscated: false },
      ]);
    }
    for (const code of ["k", "l", "o", "r", "x", "y", "z"]) {
      expect(minecraftColorOf(code)).toBeUndefined();
    }
  });

  it("resets color and formatting on §r", () => {
    expect(parseMinecraftLine("§r")).toEqual([]);
    expect(parseMinecraftLine("§aX§rY")).toEqual([
      { start: 2, end: 3, color: "#54FF54", bold: false, italic: false, obfuscated: false },
    ]);
    const spans = parseMinecraftLine("§l§o§k§aX§r§bY");
    expect(spans).toHaveLength(2);
    expect(spans[0]).toMatchObject({
      color: "#54FF54",
      bold: true,
      italic: true,
      obfuscated: true,
    });
    expect(spans[1]).toMatchObject({
      color: "#54FFFF",
      bold: false,
      italic: false,
      obfuscated: false,
    });
  });
});
