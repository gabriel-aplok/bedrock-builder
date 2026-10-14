import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  BP_FOLDERS,
  RP_FOLDERS,
  createFolders,
  listFolderOptions,
} from "../src/commands/folders.js";
import { setupFixture } from "./helpers.js";

function subpaths(defs: { subpath: string }[]): string[] {
  return defs.map((d) => d.subpath);
}

describe("folders command", () => {
  let fx: Awaited<ReturnType<typeof setupFixture>>;

  beforeEach(async () => {
    fx = await setupFixture();
  });
  afterEach(async () => {
    await fx.cleanup();
  });

  describe("canonical lists", () => {
    it("BP_FOLDERS uses plural 'entities' (server-side convention)", () => {
      expect(subpaths(BP_FOLDERS)).toContain("entities");
      expect(subpaths(BP_FOLDERS)).not.toContain("entity");
    });

    it("RP_FOLDERS uses singular 'entity' (client-side convention)", () => {
      expect(subpaths(RP_FOLDERS)).toContain("entity");
      expect(subpaths(RP_FOLDERS)).not.toContain("entities");
    });

    it("RP textures + models use singular 'entity' subdir", () => {
      expect(subpaths(RP_FOLDERS)).toContain("textures/entity");
      expect(subpaths(RP_FOLDERS)).toContain("models/entity");
    });

    it("BP_FOLDERS does NOT include 'scripts' (reserved for the bundler)", () => {
      expect(subpaths(BP_FOLDERS)).not.toContain("scripts");
    });

    it("every entry has a non-empty hint", () => {
      for (const def of [...BP_FOLDERS, ...RP_FOLDERS]) {
        expect(def.hint.trim().length).toBeGreaterThan(0);
      }
    });
  });

  describe("listFolderOptions", () => {
    it("returns absolute paths anchored at the configured pack roots", async () => {
      const { bp, rp } = await listFolderOptions(fx.config);
      expect(bp.length).toBe(BP_FOLDERS.length);
      expect(rp.length).toBe(RP_FOLDERS.length);
      expect(bp.some((o) => o.value.endsWith(join("BP", "entities")))).toBe(true);
      expect(rp.some((o) => o.value.endsWith(join("RP", "entity")))).toBe(true);
    });

    it("marks already-existing folders with the existing flag", async () => {
      const itemsDir = join(fx.config.packs.bp, "items");
      await mkdir(itemsDir, { recursive: true });

      const { bp } = await listFolderOptions(fx.config);
      const itemsOpt = bp.find((o) => o.value === itemsDir);
      expect(itemsOpt?.existing).toBe(true);
      expect(itemsOpt?.label).toContain("(exists)");

      const blocksOpt = bp.find((o) => o.value === join(fx.config.packs.bp, "blocks"));
      expect(blocksOpt?.existing).toBe(false);
      expect(blocksOpt?.label).not.toContain("(exists)");
    });
  });

  describe("createFolders", () => {
    it("creates the requested directories and reports counts", async () => {
      const one = join(fx.config.packs.bp, "blocks");
      const two = join(fx.config.packs.rp, "models", "entity");

      const result = await createFolders([one, two]);
      expect(result.created).toBe(2);
      expect(result.alreadyExisted).toBe(0);
      expect((await stat(one)).isDirectory()).toBe(true);
      expect((await stat(two)).isDirectory()).toBe(true);
    });

    it("skips existing directories without erroring", async () => {
      const existing = join(fx.config.packs.bp, "loot_tables");
      await mkdir(existing, { recursive: true });
      const fresh = join(fx.config.packs.rp, "particles");

      const result = await createFolders([existing, fresh]);
      expect(result.created).toBe(1);
      expect(result.alreadyExisted).toBe(1);
      expect((await stat(fresh)).isDirectory()).toBe(true);
    });

    it("handles empty input as a no-op", async () => {
      expect(await createFolders([])).toEqual({ created: 0, alreadyExisted: 0 });
    });
  });
});
