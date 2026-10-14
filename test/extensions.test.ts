import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clearProcessors,
  customProcessors,
  inspectExtensions,
  loadExtensions,
  resolveExtensionPath,
  resolveProcessors,
} from "../src/index.js";
import {
  discoverExtensions,
  globalExtensionsDir,
  projectExtensionsDir,
} from "../src/pipeline/loader.js";
import { setupFixture } from "./helpers.js";

async function writeExtension(root: string, entry: string, body: string): Promise<void> {
  await mkdir(root, { recursive: true });
  await writeFile(join(root, "extension.json"), JSON.stringify({ name: "test", entry }));
  await writeFile(join(root, entry), body);
}

const STAMP_PROCESSOR = `export default { name: "stamp-test", match: () => true };`;

describe("extension loader", () => {
  beforeEach(() => clearProcessors());
  afterEach(() => clearProcessors());

  it("loads a relative file entry and registers its processors", async () => {
    const fixture = await setupFixture();
    try {
      await mkdir(join(fixture.root, "ext"), { recursive: true });
      await writeFile(join(fixture.root, "ext", "stamp.mjs"), STAMP_PROCESSOR);
      const config = { ...fixture.config, extensions: ["./ext/stamp.mjs"] };
      const report = await loadExtensions(config);
      expect(report.loaded).toBe(1);
      expect(report.skipped).toEqual([]);
      expect(customProcessors().map((stage) => stage.name)).toContain("stamp-test");
    } finally {
      await fixture.cleanup();
    }
  });

  it("missing entries warn and skip, never throw", async () => {
    const fixture = await setupFixture();
    try {
      const config = { ...fixture.config, extensions: ["./nope/missing.mjs"] };
      const report = await loadExtensions(config);
      expect(report.loaded).toBe(0);
      expect(report.skipped).toEqual(["./nope/missing.mjs"]);
      expect(customProcessors()).toEqual([]);
    } finally {
      await fixture.cleanup();
    }
  });

  it("broken entries warn and skip, never throw", async () => {
    const fixture = await setupFixture();
    try {
      await mkdir(join(fixture.root, "ext"), { recursive: true });
      await writeFile(join(fixture.root, "ext", "broken.mjs"), "throw new Error('boom');");
      const config = { ...fixture.config, extensions: ["./ext/broken.mjs"] };
      const report = await loadExtensions(config);
      expect(report.loaded).toBe(0);
      expect(report.skipped).toEqual(["./ext/broken.mjs"]);
    } finally {
      await fixture.cleanup();
    }
  });

  it("resolves bare names from the project extensions dir", async () => {
    const fixture = await setupFixture();
    try {
      const root = join(fixture.root, ".builder", "extensions", "stamp");
      await writeExtension(root, "index.mjs", STAMP_PROCESSOR);
      const config = { ...fixture.config, extensions: ["stamp"] };
      const report = await loadExtensions(config);
      expect(report.loaded).toBe(1);
      expect(customProcessors().map((stage) => stage.name)).toContain("stamp-test");
    } finally {
      await fixture.cleanup();
    }
  });

  it("discovers manifest roots under a dir", async () => {
    const dir = await mkdtemp(join(tmpdir(), "discover-"));
    try {
      await writeExtension(join(dir, "good"), "index.mjs", STAMP_PROCESSOR);
      await mkdir(join(dir, "empty"), { recursive: true });
      const found = await discoverExtensions(dir);
      expect(found).toEqual([join(dir, "good")]);
      expect(await discoverExtensions(join(dir, "missing"))).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("dir helpers point at the right places", async () => {
    const fixture = await setupFixture();
    try {
      expect(projectExtensionsDir(fixture.config)).toBe(
        join(fixture.root, ".builder", "extensions"),
      );
      expect(globalExtensionsDir().endsWith(join(".bedrock-builder", "extensions"))).toBe(true);
    } finally {
      await fixture.cleanup();
    }
  });

  it("rejects non-string extension entries at load", async () => {
    const fixture = await setupFixture();
    try {
      const { loadConfig } = await import("../src/config.js");
      await writeFile(
        join(fixture.root, "bad.json"),
        JSON.stringify({
          name: "x",
          version: "1.0.0",
          packs: { bp: "packs/BP", rp: "packs/RP" },
          entry: "src/main.ts",
          out: "dist",
          deploy: { target: "custom", customPath: "." },
          extensions: [42],
        }),
      );
      await expect(loadConfig(join(fixture.root, "bad.json"))).rejects.toThrow();
    } finally {
      await fixture.cleanup();
    }
  });

  it("resolves the file path for a good entry", async () => {
    const fixture = await setupFixture();
    try {
      await mkdir(join(fixture.root, "ext"), { recursive: true });
      await writeFile(join(fixture.root, "ext", "stamp.mjs"), STAMP_PROCESSOR);
      const path = await resolveExtensionPath("./ext/stamp.mjs", fixture.root);
      expect(path).toBe(join(fixture.root, "ext", "stamp.mjs"));
      expect(await resolveExtensionPath("./nope/missing.mjs", fixture.root)).toBeNull();
    } finally {
      await fixture.cleanup();
    }
  });

  it("inspects ok, missing, and broken entries without registering", async () => {
    const fixture = await setupFixture();
    try {
      await mkdir(join(fixture.root, "ext"), { recursive: true });
      await writeFile(join(fixture.root, "ext", "stamp.mjs"), STAMP_PROCESSOR);
      await writeFile(join(fixture.root, "ext", "broken.mjs"), "throw new Error('boom');");
      const config = {
        ...fixture.config,
        extensions: ["./ext/stamp.mjs", "./nope/missing.mjs", "./ext/broken.mjs"],
      };
      const rows = await inspectExtensions(config);
      expect(rows.map((row) => row.status)).toEqual(["ok", "missing", "broken"]);
      expect(rows[0]?.processors).toEqual(["stamp-test"]);
      expect(rows[0]?.path).toBe(join(fixture.root, "ext", "stamp.mjs"));
      expect(rows[1]?.path).toBeNull();
      expect(rows[2]?.reason).toContain("boom");
      expect(customProcessors()).toEqual([]);
    } finally {
      await fixture.cleanup();
    }
  });
});

describe("extension dependencies", () => {
  it("detects missing deps from the manifest", async () => {
    const { missingExtensionDeps } = await import("../src/index.js");
    const missing = await missingExtensionDeps("extensions/json-cleaner", {
      "jsonc-parser": "^3.3.1",
    });
    expect(missing).toEqual(["jsonc-parser"]);
  });

  it("reports deps with no local install", async () => {
    const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { missingExtensionDeps } = await import("../src/index.js");
    const dir = await mkdtemp(join(tmpdir(), "bb-ext-deps-"));
    try {
      await writeFile(
        join(dir, "extension.json"),
        JSON.stringify({ name: "x", entry: "index.mjs" }),
      );
      const missing = await missingExtensionDeps(dir, { "some-pkg": "^1.0.0" });
      expect(missing).toEqual(["some-pkg"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("extension manifest merge", () => {
  it("merges package.json entry and deps when extension.json is absent", async () => {
    const { readManifestFor } = await import("../src/index.js");
    const missing = await readManifestForFixture({
      "package.json": JSON.stringify({
        name: "x",
        main: "pkg-entry.mjs",
        dependencies: { "some-pkg": "^1.0.0" },
      }),
    });
    expect(missing).toEqual({
      entry: "pkg-entry.mjs",
      dependencies: { "some-pkg": "^1.0.0" },
    });
  });

  it("merges deps from both manifests with builder deps winning", async () => {
    const { readManifestFor } = await import("../src/index.js");
    const merged = await readManifestForFixture({
      "extension.json": JSON.stringify({
        name: "x",
        entry: "index.mjs",
        dependencies: { shared: "^2.0.0" },
      }),
      "package.json": JSON.stringify({
        name: "x",
        main: "index.mjs",
        dependencies: { shared: "^1.0.0", extra: "^3.0.0" },
      }),
    });
    expect(merged).toEqual({
      entry: "index.mjs",
      dependencies: { shared: "^2.0.0", extra: "^3.0.0" },
    });
  });

  it("warns when entries conflict and keeps the extension.json entry", async () => {
    const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { readManifestFor } = await import("../src/index.js");
    const dir = await mkdtemp(join(tmpdir(), "bb-ext-merge-"));
    const warnings: string[] = [];
    const stdout = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array) => {
      warnings.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(
        join(dir, "extension.json"),
        JSON.stringify({ name: "x", entry: "builder.mjs" }),
      );
      await writeFile(join(dir, "package.json"), JSON.stringify({ name: "x", main: "pkg.mjs" }));
      const manifest = await readManifestFor(dir);
      expect(manifest?.entry).toBe("builder.mjs");
      expect(warnings.some((line) => line.includes("entry conflict"))).toBe(true);
    } finally {
      process.stderr.write = stdout;
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("exposes optional extension health checks in status", async () => {
    const fixture = await setupFixture();
    try {
      const root = join(fixture.root, "health-ext");
      await mkdir(root, { recursive: true });
      await writeFile(
        join(root, "extension.json"),
        JSON.stringify({ name: "health", entry: "index.mjs" }),
      );
      await writeFile(
        join(root, "index.mjs"),
        `export default { name: "health-stage", match: () => true };\nexport const check = async () => [{ name: "tool", ok: false, detail: "missing" }];`,
      );
      const rows = await inspectExtensions({
        ...fixture.config,
        extensions: ["./health-ext"],
      });
      expect(rows[0]?.checks).toEqual([{ name: "tool", ok: false, detail: "missing" }]);
    } finally {
      await fixture.cleanup();
    }
  });
});

async function readManifestForFixture(files: Record<string, string>): Promise<unknown> {
  const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { readManifestFor } = await import("../src/index.js");
  const dir = await mkdtemp(join(tmpdir(), "bb-ext-merge-"));
  try {
    await mkdir(dir, { recursive: true });
    for (const [name, body] of Object.entries(files)) {
      await writeFile(join(dir, name), body);
    }
    return await readManifestFor(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
