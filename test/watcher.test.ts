import { describe, expect, it } from "vitest";

import {
  isIgnoredBy,
  isSkippedDir,
  isTempFile,
  parseIgnoreFile,
  WATCH_DEBOUNCE_MS,
} from "../src/watcher.js";

describe("watcher helpers", () => {
  it("flags editor temp files", () => {
    expect(isTempFile("packs/BP/items/.example.json.swp")).toBe(true);
    expect(isTempFile("packs/BP/items/example.json~")).toBe(true);
    expect(isTempFile("packs/BP/items/~example.json")).toBe(true);
    expect(isTempFile("packs/BP/items/example.json.tmp")).toBe(true);
    expect(isTempFile("packs/BP/items/example.json.part")).toBe(true);
    expect(isTempFile("packs/BP/items/example.json")).toBe(false);
  });

  it("skips version control plus dependency dirs", () => {
    expect(isSkippedDir(".git/objects/pack/file")).toBe(true);
    expect(isSkippedDir("packs/BP/node_modules/tool/file.js")).toBe(true);
    expect(isSkippedDir("packs/BP/items/example.json")).toBe(false);
  });

  it("parses gitignore lines and matches globs", () => {
    const rules = parseIgnoreFile("# comment\n\ndist/\n*.log\n!keep.log\n");
    expect(rules.patterns).toEqual(["dist/", "*.log", "!keep.log"]);
    expect(isIgnoredBy(rules, "dist/packs/BP/x.json")).toBe(true);
    expect(isIgnoredBy(rules, "packs/BP/debug.log")).toBe(true);
    expect(isIgnoredBy(rules, "packs/BP/keep.log")).toBe(false);
    expect(isIgnoredBy(rules, "packs/BP/items/x.json")).toBe(false);
  });

  it("keeps the debounce window small", () => {
    expect(WATCH_DEBOUNCE_MS).toBeLessThanOrEqual(200);
  });
});
