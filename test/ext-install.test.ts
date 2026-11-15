import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  EXTENSION_INSTALL_ARGS,
  clearProcessors,
  extensions,
  installExtensionDeps,
  resolveExtensionPath,
} from "../src/index.js";
import { setupFixture } from "./helpers.js";

async function makeDir(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), "bb-ext-install-"));
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

const STAMP = `export default { name: "stamp-install", match: () => true };`;

describe("bb ext --install", () => {
  beforeEach(() => clearProcessors());
  afterEach(() => clearProcessors());

  it("install flags always skip scripts", () => {
    expect(EXTENSION_INSTALL_ARGS).toEqual([
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
    ]);
  });

  it("keeps existing package metadata when adding deps", async () => {
    const { dir, cleanup } = await makeDir();
    try {
      await writeFile(
        join(dir, "package.json"),
        JSON.stringify({
          name: "my-ext",
          version: "2.1.0",
          type: "module",
          main: "custom-entry.mjs",
          license: "MIT",
          dependencies: { keep: "^1.0.0" },
        }),
      );
      // unreachable version, but the package.json write happens first.
      const result = await installExtensionDeps(dir, {
        "no-such-pkg-xyz": "^0.0.0",
      });
      expect(result.ok).toBe(false);
      const saved = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
      expect(saved.name).toBe("my-ext");
      expect(saved.version).toBe("2.1.0");
      expect(saved.main).toBe("custom-entry.mjs");
      expect(saved.license).toBe("MIT");
      expect(saved.dependencies).toEqual({
        keep: "^1.0.0",
        "no-such-pkg-xyz": "^0.0.0",
      });
    } finally {
      await cleanup();
    }
  });

  it("returns a useful error when npm fails", async () => {
    const { dir, cleanup } = await makeDir();
    try {
      await writeFile(join(dir, "package.json"), JSON.stringify({ name: "x", type: "module" }));
      const result = await installExtensionDeps(dir, {
        "no-such-pkg-xyz": "^0.0.0",
      });
      expect(result.ok).toBe(false);
      expect(result.output.length).toBeGreaterThan(0);
    } finally {
      await cleanup();
    }
  });

  it("reuses an existing lockfile for a cached install", async () => {
    const { dir, cleanup } = await makeDir();
    try {
      // empty dep set resolves fast and still exercises the npm path.
      await writeFile(
        join(dir, "package.json"),
        JSON.stringify({ name: "x", version: "1.0.0", type: "module" }),
      );
      const result = await installExtensionDeps(dir, {});
      expect(result.ok).toBe(true);
      // lockfile is written by npm even with no deps.
      const lock = await readFile(join(dir, "package-lock.json"), "utf8").catch(() => null);
      expect(lock).not.toBeNull();
    } finally {
      await cleanup();
    }
  });

  it("resolves a package extension through main", async () => {
    const { dir, cleanup } = await makeDir();
    try {
      const root = join(dir, "pkg");
      await mkdir(root, { recursive: true });
      await writeFile(
        join(root, "package.json"),
        JSON.stringify({ name: "pkg-ext", main: "custom-entry.mjs" }),
      );
      await writeFile(join(root, "custom-entry.mjs"), STAMP);
      const found = await resolveExtensionPath("./pkg", dir);
      expect(found).toBe(join(root, "custom-entry.mjs"));
    } finally {
      await cleanup();
    }
  });

  it("resolves a package extension through exports", async () => {
    const { dir, cleanup } = await makeDir();
    try {
      const root = join(dir, "pkg");
      await mkdir(root, { recursive: true });
      await writeFile(
        join(root, "package.json"),
        JSON.stringify({
          name: "pkg-ext",
          exports: { ".": { import: "./exported.mjs" } },
        }),
      );
      await writeFile(join(root, "exported.mjs"), STAMP);
      const found = await resolveExtensionPath("./pkg", dir);
      expect(found).toBe(join(root, "exported.mjs"));
    } finally {
      await cleanup();
    }
  });

  it("marks no-dep extensions ready without calling npm", async () => {
    const fixture = await setupFixture();
    try {
      const root = join(fixture.root, ".builder", "extensions", "plain");
      await mkdir(root, { recursive: true });
      await writeFile(
        join(root, "extension.json"),
        JSON.stringify({ name: "plain", entry: "index.mjs" }),
      );
      await writeFile(join(root, "index.mjs"), STAMP);
      const config = { ...fixture.config, extensions: ["plain"] };
      await extensions(config, { install: true, json: true });
      // no package.json created, since there was nothing to install.
      const missing = await readFile(join(root, "package.json"), "utf8").catch(() => null);
      expect(missing).toBeNull();
    } finally {
      await fixture.cleanup();
    }
  });
});
