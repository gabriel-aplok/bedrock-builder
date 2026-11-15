import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { assertInside, assertRemovable, PathGuardError } from "../src/files/guard.js";

describe("path guard", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "bb-guard-"));
    await mkdir(join(root, "packs", "BP"), { recursive: true });
    await writeFile(join(root, "config.json"), "{}");
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("accepts a child of the root", async () => {
    await expect(assertInside(root, join(root, "dist"))).resolves.toContain("dist");
  });

  it("rejects the root itself", async () => {
    await expect(assertInside(root, root)).rejects.toBeInstanceOf(PathGuardError);
  });

  it("rejects a sibling and a parent", async () => {
    await expect(assertInside(root, join(root, ".."))).rejects.toBeInstanceOf(PathGuardError);
    await expect(assertInside(root, "/etc")).rejects.toBeInstanceOf(PathGuardError);
  });

  it("rejects a child reached through a symlink", async () => {
    const link = join(root, "link");
    await symlink(tmpdir(), link, "dir");
    await expect(assertInside(root, join(link, "elsewhere"))).rejects.toBeInstanceOf(
      PathGuardError,
    );
  });

  it("rejects an out dir that is the project itself", async () => {
    await expect(assertRemovable(root, [root])).rejects.toBeInstanceOf(PathGuardError);
  });

  it("rejects an out dir that contains the packs or the entry", async () => {
    await expect(assertRemovable(root, [join(root, "packs", "BP")])).rejects.toBeInstanceOf(
      PathGuardError,
    );
  });

  it("accepts a build folder next to the sources", async () => {
    await expect(
      assertRemovable(join(root, "dist"), [root, join(root, "packs", "BP")]),
    ).resolves.toContain("dist");
  });
});
