import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { diff } from "../src/commands/diff.js";
import { runPipeline } from "../src/pipeline/index.js";
import { mapRemapped, mapToDest } from "../src/pipeline/classify.js";
import { clearProcessors, registerProcessor } from "../src/pipeline/extensions.js";
import type { FileProcessor } from "../src/pipeline/index.js";
import { setupFixture } from "./helpers.js";
import type { Fixture } from "./helpers.js";

function prefixStage(): FileProcessor {
  return {
    name: "prefix-test",
    match: (file) => file.rel.endsWith(".json"),
    remap: (file) => `${file.dst}.moved`,
  };
}

describe("remap-aware mapping", () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await setupFixture();
  });
  afterEach(async () => {
    await fixture.cleanup();
  });

  it("mirrors mapToDest without remap stages", () => {
    const changed = `${fixture.config.packs.bp}/items/example.item.json`;
    expect(mapRemapped(fixture.config, [], changed)).toEqual(mapToDest(fixture.config, changed));
  });

  it("returns null outside the packs", () => {
    expect(mapRemapped(fixture.config, [], `${fixture.root}/nope.json`)).toBeNull();
  });

  it("follows the remapped destination and rel", () => {
    const changed = `${fixture.config.packs.bp}/items/example.item.json`;
    const plain = mapToDest(fixture.config, changed)!;
    const mapped = mapRemapped(fixture.config, [prefixStage()], changed)!;
    expect(mapped.dst).toBe(`${plain.dst}.moved`);
    expect(mapped.rel).toBe(`${plain.rel}.moved`);
    expect(mapped.kind).toBe(plain.kind);
    expect(mapped.src).toBe(plain.src);
  });

  it("reports no diff after a remapped no-op build", async () => {
    clearProcessors();
    registerProcessor(prefixStage());
    try {
      await runPipeline(fixture.config, { release: false });
      const report = await diff(fixture.config, {});
      expect(report.files).toEqual([]);
    } finally {
      clearProcessors();
    }
  });
});
