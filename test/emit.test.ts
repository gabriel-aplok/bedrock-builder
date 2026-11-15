import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { diff } from "../src/commands/diff.js";
import { defineProcessor } from "../src/pipeline/extensions.js";
import { withExtensionSettings } from "../src/pipeline/extension-api.js";
import { clearProcessors, registerProcessor } from "../src/pipeline/extensions.js";
import { runPipeline } from "../src/pipeline/index.js";
import type { FileProcessor } from "../src/pipeline/index.js";
import { setupFixture } from "./helpers.js";
import type { Fixture } from "./helpers.js";

function ghostStage(files: unknown): FileProcessor {
  return {
    name: "ghost-test",
    match: () => false,
    emit: async () => files as never,
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

describe("emit hook", () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await setupFixture();
    clearProcessors();
  });
  afterEach(async () => {
    clearProcessors();
    await fixture.cleanup();
  });

  it("writes emitted files into both packs", async () => {
    registerProcessor(
      ghostStage([
        { kind: "BP", rel: "a/b.json", content: new TextEncoder().encode(`{"a":1}`) },
        { kind: "RP", rel: "c.json", content: new TextEncoder().encode(`{"c":2}`) },
      ]),
    );
    const stats = await runPipeline(fixture.config, { release: false });
    expect(stats.emitted).toBe(2);
    expect(await readFile(join(fixture.config.out, "packs", "BP", "a", "b.json"), "utf8")).toBe(
      `{"a":1}`,
    );
    expect(await readFile(join(fixture.config.out, "packs", "RP", "c.json"), "utf8")).toBe(
      `{"c":2}`,
    );
  });

  it("prunes ghosts missing from the latest set", async () => {
    registerProcessor(
      ghostStage([{ kind: "BP", rel: "old.json", content: new TextEncoder().encode(`{}`) }]),
    );
    await runPipeline(fixture.config, { release: false });
    expect(await exists(join(fixture.config.out, "packs", "BP", "old.json"))).toBe(true);
    clearProcessors();
    registerProcessor(
      ghostStage([{ kind: "BP", rel: "new.json", content: new TextEncoder().encode(`{}`) }]),
    );
    await runPipeline(fixture.config, { release: false });
    expect(await exists(join(fixture.config.out, "packs", "BP", "old.json"))).toBe(false);
    expect(await exists(join(fixture.config.out, "packs", "BP", "new.json"))).toBe(true);
  });

  it("skips escaping paths and bad shapes", async () => {
    registerProcessor(
      ghostStage([
        { kind: "BP", rel: "../evil.json", content: new TextEncoder().encode(`{}`) },
        { kind: "BP", rel: "/abs.json", content: new TextEncoder().encode(`{}`) },
        { kind: "XX", rel: "bad.json", content: new TextEncoder().encode(`{}`) },
        { kind: "BP", rel: "text.json", content: "nope" },
      ]),
    );
    const stats = await runPipeline(fixture.config, { release: false });
    expect(stats.emitted).toBe(0);
    expect(await exists(join(fixture.config.out, "packs", "BP", "evil.json"))).toBe(false);
  });

  it("keeps ghosts out of bb diff", async () => {
    registerProcessor(
      ghostStage([{ kind: "BP", rel: "ghost.json", content: new TextEncoder().encode(`{}`) }]),
    );
    await runPipeline(fixture.config, { release: false });
    const report = await diff(fixture.config, {});
    expect(report.files).toEqual([]);
  });

  it("validates the emit hook shape", () => {
    expect(() => defineProcessor({ name: "x", match: () => false, emit: 42 } as never)).toThrow();
    expect(defineProcessor({ name: "x", match: () => false, emit: async () => null }).name).toBe(
      "x",
    );
  });

  it("injects settings into the emit context", async () => {
    let seen: unknown;
    const stage = withExtensionSettings(
      {
        name: "x",
        match: () => false,
        emit: async (ctx: never) => {
          seen = (ctx as { settings?: unknown }).settings;
          return null;
        },
      },
      { seed: "s" },
    );
    await runPipeline(fixture.config, { release: false }, [stage]);
    expect(seen).toEqual({ seed: "s" });
  });
});
