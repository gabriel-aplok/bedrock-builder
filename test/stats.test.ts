import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { collectBuildStats } from "../src/build/stats.js";
import { build } from "../src/commands/build.js";
import { setupFixture } from "./helpers.js";

describe("build stats", () => {
  it("sums bytes, flags the bundle, ranks the biggest", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bb-stats-"));
    try {
      await mkdir(join(dir, "packs", "BP"), { recursive: true });
      await writeFile(join(dir, "packs", "BP", "a.json"), "x".repeat(100));
      await writeFile(join(dir, "packs", "BP", "b.json"), "x".repeat(50));
      await writeFile(join(dir, ".builder-cache.json"), "{}");
      await writeFile(join(dir, "out.mcaddon"), "x".repeat(999));

      const bundle = join(dir, "packs", "BP", "a.json");
      const stats = await collectBuildStats(dir, bundle);
      expect(stats.totalBytes).toBe(150);
      expect(stats.bundleBytes).toBe(100);
      expect(stats.fileCount).toBe(2);
      expect(stats.biggest).toHaveLength(2);
      expect(stats.biggest[0]?.path).toBe("packs/BP/a.json");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("build --stats lands on the report", async () => {
    const fixture = await setupFixture();
    try {
      const report = await build(fixture.config, { stats: true });
      expect(report.stats).toBeDefined();
      expect(report.stats!.fileCount).toBeGreaterThan(0);
      expect(report.stats!.totalBytes).toBeGreaterThan(0);
    } finally {
      await fixture.cleanup();
    }
  });
});
