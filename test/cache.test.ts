import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BuildCache } from "../src/pipeline/cache.js";
import { setupFixture } from "./helpers.js";

interface Sandbox {
  root: string;
  out: string;
  cleanup: () => Promise<void>;
}

async function openSandbox(): Promise<Sandbox> {
  const root = await mkdtemp(join(tmpdir(), "cache-test-"));
  const out = join(root, "dist");
  await mkdir(out, { recursive: true });
  return {
    root,
    out,
    cleanup: () => rm(root, { recursive: true, force: true }).then(() => undefined),
  };
}

async function gone(path: string): Promise<boolean> {
  try {
    await stat(path);
    return false;
  } catch {
    return true;
  }
}

function txt(root: string, ...parts: string[]): string {
  return join(root, ...parts);
}

describe("BuildCache", () => {
  let box: Sandbox;

  beforeEach(async () => {
    box = await openSandbox();
  });
  afterEach(async () => {
    await box.cleanup();
  });

  it("skips files whose hash matches, reprocesses after a change", async () => {
    const cache = new BuildCache();
    await cache.open(box.out, box.root, false);

    const src = txt(box.root, "a.txt");
    const dst = txt(box.out, "a.txt");
    await writeFile(src, "v1");

    const first = await cache.shouldSkip(src, dst, "dev");
    expect(first.skip).toBe(false);
    cache.note(src, dst, first.hash, "dev", 0, 0);
    await cache.save();

    const again = new BuildCache();
    await again.open(box.out, box.root, false);
    await writeFile(dst, "v1");
    expect((await again.shouldSkip(src, dst, "dev")).skip).toBe(true);

    await writeFile(src, "v2 changed");
    expect((await again.shouldSkip(src, dst, "dev")).skip).toBe(false);
  });

  it("never skips when the output is missing", async () => {
    const cache = new BuildCache();
    await cache.open(box.out, box.root, false);

    const src = txt(box.root, "a.txt");
    await writeFile(src, "v1");
    const dst = txt(box.out, "a.txt");

    const first = await cache.shouldSkip(src, dst, "dev");
    expect(first.skip).toBe(false);
    cache.note(src, dst, first.hash, "dev", 0, 0);
    await cache.save();

    const again = new BuildCache();
    await again.open(box.out, box.root, false);
    expect((await again.shouldSkip(src, dst, "dev")).skip).toBe(false);
  });

  it("treats dev and release as different modes", async () => {
    const cache = new BuildCache();
    await cache.open(box.out, box.root, false);

    const src = txt(box.root, "a.txt");
    const dst = txt(box.out, "a.txt");
    await writeFile(src, "same");
    await writeFile(dst, "same");

    const dev = await cache.shouldSkip(src, dst, "dev");
    expect(dev.skip).toBe(false);
    cache.note(src, dst, dev.hash, "dev", 0, 0);
    expect((await cache.shouldSkip(src, dst, "dev")).skip).toBe(true);

    const release = await cache.shouldSkip(src, dst, "release");
    expect(release.skip).toBe(false);
    cache.note(src, dst, release.hash, "release", 0, 0);
    expect((await cache.shouldSkip(src, dst, "release")).skip).toBe(true);
  });

  it("clean mode processes everything and drops the cache file", async () => {
    const cache = new BuildCache();
    await cache.open(box.out, box.root, false);

    const src = txt(box.root, "a.txt");
    const dst = txt(box.out, "a.txt");
    await writeFile(src, "v1");
    await writeFile(dst, "v1");
    const first = await cache.shouldSkip(src, dst, "dev");
    cache.note(src, dst, first.hash, "dev", 0, 0);
    await cache.save();

    const fresh = new BuildCache();
    await fresh.open(box.out, box.root, true);
    const miss = await fresh.shouldSkip(src, dst, "dev");
    expect(miss.skip).toBe(false);
    expect(fresh.processed).toBe(1);
  });

  it("survives a corrupt cache file by starting fresh", async () => {
    await writeFile(join(box.out, ".builder-cache.json"), "not json{{{");

    const cache = new BuildCache();
    await cache.open(box.out, box.root, false);
    expect(cache.size).toBe(0);

    const src = txt(box.root, "a.txt");
    await writeFile(src, "v1");
    expect((await cache.shouldSkip(src, txt(box.out, "a.txt"), "dev")).skip).toBe(false);
  });

  it("prunes outputs whose sources vanished, plus empty dirs", async () => {
    const cache = new BuildCache();
    await cache.open(box.out, box.root, false);

    const src = txt(box.root, "sub", "gone.txt");
    const dst = txt(box.out, "packs", "BP", "sub", "gone.txt");
    await mkdir(txt(box.root, "sub"), { recursive: true });
    await writeFile(src, "bye");
    await mkdir(txt(box.out, "packs", "BP", "sub"), { recursive: true });
    await writeFile(dst, "bye");

    const first = await cache.shouldSkip(src, dst, "dev");
    cache.note(src, dst, first.hash, "dev", 0, 0);
    await cache.save();

    await rm(src, { force: true });
    const again = new BuildCache();
    await again.open(box.out, box.root, false);
    await again.pruneStale();
    await again.pruneEmptyDirs(txt(box.out, "packs", "BP"));

    expect(await gone(dst)).toBe(true);
    expect(again.prunedFiles).toBe(1);
  });

  it("pruneEmptyDirs keeps the bundler scripts dir while esbuild writes", async () => {
    const cache = new BuildCache();
    await cache.open(box.out, box.root, false);

    // empty scripts dir, as seen when the bundler created it
    // but esbuild has not written main.js yet.
    const scripts = txt(box.out, "packs", "BP", "scripts");
    await mkdir(scripts, { recursive: true });
    await cache.pruneEmptyDirs(txt(box.out, "packs", "BP"), [scripts]);

    expect(await gone(scripts)).toBe(false);
  });

  it("drop removes one entry and its output without touching siblings", async () => {
    const cache = new BuildCache();
    await cache.open(box.out, box.root, false);

    await mkdir(txt(box.out, "packs"), { recursive: true });
    const keepSrc = txt(box.root, "keep.txt");
    const keepDst = txt(box.out, "packs", "keep.txt");
    const dropSrc = txt(box.root, "drop.txt");
    const dropDst = txt(box.out, "packs", "drop.txt");
    await writeFile(keepSrc, "keep");
    await writeFile(keepDst, "keep");
    await writeFile(dropSrc, "drop");
    await writeFile(dropDst, "drop");

    const kept = await cache.shouldSkip(keepSrc, keepDst, "dev");
    cache.note(keepSrc, keepDst, kept.hash, "dev", 0, 0);
    const dropped = await cache.shouldSkip(dropSrc, dropDst, "dev");
    cache.note(dropSrc, dropDst, dropped.hash, "dev", 0, 0);

    await cache.drop(dropSrc);

    expect(await gone(dropDst)).toBe(true);
    expect((await stat(keepDst)).isFile()).toBe(true);
  });

  it("memoizes hashes within a run and forgets on demand", async () => {
    const cache = new BuildCache();
    await cache.open(box.out, box.root, false);

    const src = txt(box.root, "a.txt");
    await writeFile(src, "v1");
    const first = await cache.hashOf(src);
    expect(await cache.hashOf(src)).toBe(first);
    expect(first.length).toBe(64);

    cache.forget(src);
    await writeFile(src, "v2");
    expect(await cache.hashOf(src)).not.toBe(first);
  });

  it("returns empty hash for missing files", async () => {
    const cache = new BuildCache();
    await cache.open(box.out, box.root, false);
    expect(await cache.hashOf(txt(box.root, "nope.txt"))).toBe("");
  });
});

describe("incremental pipeline", () => {
  let fixture: Awaited<ReturnType<typeof setupFixture>>;

  beforeEach(async () => {
    fixture = await setupFixture();
  });
  afterEach(async () => {
    await fixture.cleanup();
  });

  function bpItem(): string {
    return join(fixture.config.packs.bp, "items", "example.item.json");
  }

  async function touchItem(): Promise<void> {
    const raw = JSON.parse(await readFile(bpItem(), "utf8")) as Record<string, unknown>;
    const item = raw["minecraft:item"] as Record<string, unknown>;
    (item.description as Record<string, unknown>).description = "touched";
    await writeFile(bpItem(), `${JSON.stringify(raw, null, 2)}\n`);
  }

  it("second build hits the cache, touching a file rebuilds only it", async () => {
    const { runPipeline } = await import("../src/pipeline/index.js");
    const first = await runPipeline(fixture.config, { release: false });
    expect(first.processed).toBeGreaterThan(0);

    const second = await runPipeline(fixture.config, { release: false });
    expect(second.processed).toBe(0);
    expect(second.skipped).toBe(first.processed);

    await touchItem();

    const third = await runPipeline(fixture.config, { release: false });
    expect(third.processed).toBe(1);
    expect(third.skipped).toBe(first.processed - 1);
  });

  it("deleting a source prunes its dist output on the next run", async () => {
    const { runPipeline } = await import("../src/pipeline/index.js");
    await runPipeline(fixture.config, { release: false });

    const extra = join(fixture.config.packs.bp, "items", "temp.item.json");
    await writeFile(extra, '{"temp": true}\n');
    expect((await runPipeline(fixture.config, { release: false })).processed).toBeGreaterThan(0);

    const mirrored = join(fixture.config.out, "packs", "BP", "items", "temp.item.json");
    expect((await stat(mirrored)).isFile()).toBe(true);

    await rm(extra, { force: true });
    const afterDelete = await runPipeline(fixture.config, { release: false });

    expect(await gone(mirrored)).toBe(true);
    expect(afterDelete.prunedFiles).toBeGreaterThanOrEqual(1);
  });

  it("release and dev builds do not share cache hits", async () => {
    const { runPipeline } = await import("../src/pipeline/index.js");
    expect((await runPipeline(fixture.config, { release: false })).processed).toBeGreaterThan(0);
    expect((await runPipeline(fixture.config, { release: true })).processed).toBeGreaterThan(0);
  });

  it("cache file lives in the output dir", async () => {
    const { runPipeline } = await import("../src/pipeline/index.js");
    await runPipeline(fixture.config, { release: false });
    const stored = await readFile(join(fixture.config.out, ".builder-cache.json"), "utf8");
    const entries = JSON.parse(stored) as Record<
      string,
      { hash: string; mode: string; out: string }
    >;
    expect(Object.keys(entries).length).toBeGreaterThan(0);
    const first = entries[Object.keys(entries)[0]!]!;
    expect(first.hash.length).toBe(64);
    expect(first.mode).toBe("dev");
  });

  it("diff lists added, modified, and deleted files from the cache", async () => {
    const { runPipeline } = await import("../src/pipeline/index.js");
    const { diff } = await import("../src/commands/diff.js");
    await runPipeline(fixture.config, { release: false });

    const clean = await diff(fixture.config);
    expect(clean.files).toEqual([]);

    await touchItem();
    const extra = join(fixture.config.packs.bp, "items", "extra.item.json");
    await writeFile(extra, '{"extra": true}\n');
    const changed = await diff(fixture.config);
    expect(changed.files.some((r) => r.status === "modified")).toBe(true);
    expect(changed.files.some((r) => r.status === "added")).toBe(true);

    const { runPipeline: rebuild } = await import("../src/pipeline/index.js");
    await rebuild(fixture.config, { release: false });
    await rm(extra, { force: true });
    const afterDelete = await diff(fixture.config);
    expect(afterDelete.files.some((r) => r.status === "deleted")).toBe(true);
  });

  it("diff with no cache lists every source as added", async () => {
    const { diff } = await import("../src/commands/diff.js");
    const report = await diff(fixture.config);
    expect(report.added).toBeGreaterThan(0);
    expect(report.deleted).toBe(0);
  });
});
