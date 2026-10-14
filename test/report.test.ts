import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { report } from "../src/commands/report.js";
import { setupFixture } from "./helpers.js";

function entity(id: string): string {
  return `${JSON.stringify({
    format_version: "1.21.0",
    "minecraft:entity": { description: { identifier: id } },
  })}\n`;
}

describe("report", () => {
  it("counts pack content by kind", async () => {
    const { config, cleanup } = await setupFixture();
    try {
      const result = await report(config, {});
      expect(result.command).toBe("report");
      expect(result.ok).toBe(true);
      expect(result.files).toBeGreaterThan(0);
      expect(result.bp.kinds.item).toBe(1);
      expect(result.duplicates).toEqual([]);
      expect(result.invalid).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  it("flags duplicates, invalid json, and oversized files", async () => {
    const { config, root, cleanup } = await setupFixture();
    try {
      const dir = join(root, "packs", "BP", "entities");
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "a.json"), entity("test:dupe"));
      await writeFile(join(dir, "b.json"), entity("test:dupe"));
      await writeFile(join(dir, "broken.json"), "{nope");
      await writeFile(join(root, "packs", "BP", "big.bin"), Buffer.alloc(100));
      const result = await report(config, { maxBytes: 10 });
      expect(result.duplicates).toEqual([
        { id: "test:dupe", files: ["BP/entities/a.json", "BP/entities/b.json"] },
      ]);
      expect(result.invalid).toEqual(["BP/entities/broken.json"]);
      expect(result.oversized.some((row) => row.path === "BP/big.bin")).toBe(true);
      expect(result.bp.kinds.entity).toBe(2);
    } finally {
      await cleanup();
    }
  });

  it("prints json without logging", async () => {
    const { config, cleanup } = await setupFixture();
    try {
      const logged: string[] = [];
      const { logger } = await import("../src/logger.js");
      const orig = logger.info;
      logger.info = (line: string) => {
        logged.push(line);
      };
      try {
        const result = await report(config, { json: true });
        expect(result.ok).toBe(true);
        expect(logged).toEqual([]);
      } finally {
        logger.info = orig;
      }
    } finally {
      await cleanup();
    }
  });
});
