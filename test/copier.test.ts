import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { copyPackFiles } from "../src/copier.js";
import { syncTree } from "../src/sync.js";
import { setupFixture } from "./helpers.js";

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

describe("copyPackFiles", () => {
  let fixture: Awaited<ReturnType<typeof setupFixture>>;

  beforeEach(async () => {
    fixture = await setupFixture();
  });
  afterEach(async () => {
    await fixture.cleanup();
  });

  it("copies BP items and RP textures into dist/packs/", async () => {
    await copyPackFiles(fixture.config);

    const dist = (...parts: string[]) => join(fixture.root, "dist", ...parts);
    expect(await isFile(dist("packs", "BP", "manifest.json"))).toBe(true);
    expect(await isFile(dist("packs", "BP", "items", "example.item.json"))).toBe(true);
    expect(await isFile(dist("packs", "RP", "manifest.json"))).toBe(true);
    expect(await isFile(dist("packs", "RP", "textures", "example.png"))).toBe(true);
  });
});

describe("syncTree (incremental deploy)", () => {
  let from: string;
  let into: string;

  beforeEach(async () => {
    from = await mkdtemp(join(tmpdir(), "synctree-src-"));
    into = await mkdtemp(join(tmpdir(), "synctree-dst-"));
  });
  afterEach(async () => {
    await rm(from, { recursive: true, force: true });
    await rm(into, { recursive: true, force: true });
  });

  it("copies new/changed files, prunes stale ones, and skips unchanged", async () => {
    await mkdir(join(from, "sub"), { recursive: true });
    await writeFile(join(from, "keep.txt"), "keep");
    await writeFile(join(from, "change.txt"), "v1");
    await writeFile(join(from, "sub", "gone.txt"), "gone");

    await syncTree(from, into);
    expect(await readFile(join(into, "keep.txt"), "utf8")).toBe("keep");
    expect(await readFile(join(into, "change.txt"), "utf8")).toBe("v1");
    expect(await readFile(join(into, "sub", "gone.txt"), "utf8")).toBe("gone");

    const keepMtime = (await stat(join(into, "keep.txt"))).mtimeMs;

    // change one file, add one, delete one, plus a stray dst-only file.
    await writeFile(join(from, "change.txt"), "v2-longer");
    await writeFile(join(from, "added.txt"), "new");
    await rm(join(from, "sub", "gone.txt"), { force: true });
    await writeFile(join(into, "stale.txt"), "stale");

    await syncTree(from, into);

    expect(await readFile(join(into, "change.txt"), "utf8")).toBe("v2-longer");
    expect(await readFile(join(into, "added.txt"), "utf8")).toBe("new");
    await expect(stat(join(into, "sub", "gone.txt"))).rejects.toBeTruthy();
    await expect(stat(join(into, "stale.txt"))).rejects.toBeTruthy();
    // untouched files keep their mtime: no redundant copy happened.
    expect((await stat(join(into, "keep.txt"))).mtimeMs).toBe(keepMtime);
  });
});
