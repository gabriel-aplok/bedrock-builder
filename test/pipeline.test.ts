import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  collectFiles,
  isUnchanged,
  processFile,
  resolveProcessors,
} from "../src/pipeline/index.js";
import type { PipelineFile } from "../src/pipeline/index.js";
import { normalizeText } from "../src/pipeline/processors/normalize-text.js";
import { validateJson } from "../src/pipeline/processors/validate-json.js";
import { setupFixture } from "./helpers.js";

function packFile(rel = "pack/x.json"): PipelineFile {
  return { src: "x.json", dst: "y.json", rel, kind: "BP", size: 0, mtimeMs: 0 };
}

describe("pipeline", () => {
  let fixture: Awaited<ReturnType<typeof setupFixture>>;

  beforeEach(async () => {
    fixture = await setupFixture();
  });
  afterEach(async () => {
    await fixture.cleanup();
  });

  it("collects BP and RP files with pack-relative ids", async () => {
    const { destRoot } = await import("../src/pipeline/index.js");
    const bpFiles = await collectFiles(
      fixture.config.packs.bp,
      destRoot(fixture.config, "BP"),
      "BP",
      true,
    );
    const rpFiles = await collectFiles(
      fixture.config.packs.rp,
      destRoot(fixture.config, "RP"),
      "RP",
      false,
    );
    expect(bpFiles.length).toBeGreaterThan(0);
    expect(rpFiles.length).toBeGreaterThan(0);
    expect(bpFiles.every((f) => f.kind === "BP")).toBe(true);
    expect(rpFiles.every((f) => f.kind === "RP")).toBe(true);
    expect(bpFiles.every((f) => !f.rel.startsWith("scripts"))).toBe(true);
  });

  it("reports unchanged files so rebuilds skip the copy", async () => {
    const { runPipeline } = await import("../src/pipeline/index.js");
    const first = await runPipeline(fixture.config, { release: false });
    expect(first.processed).toBeGreaterThan(0);
    const second = await runPipeline(fixture.config, { release: false });
    expect(second.processed).toBe(0);
    expect(second.skipped).toBe(first.processed);
  });

  it("a failing processor warns and falls back to raw bytes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pipeline-fallback-"));
    try {
      const src = join(dir, "a.txt");
      const dst = join(dir, "out", "a.txt");
      await writeFile(src, "hello");
      await processFile(
        {
          src,
          dst,
          rel: "a.txt",
          kind: "BP",
          size: 5,
          mtimeMs: Date.now(),
        },
        [
          {
            name: "boom",
            match: () => true,
            transform: () => {
              throw new Error("boom");
            },
          },
        ],
        { release: false },
      );
      expect(await readFile(dst, "utf8")).toBe("hello");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("normalize-text processor", () => {
  const ctx = { release: false };

  it("strips BOM and CRLF, leaves clean text alone", async () => {
    const file = packFile();
    expect(normalizeText.match(file)).toBe(true);
    expect(normalizeText.match(packFile("tex/a.png"))).toBe(false);

    const dirty = new TextEncoder().encode('﻿{\r\n"a": 1\r}\r\n');
    expect(new TextDecoder().decode((await normalizeText.transform!(dirty, file, ctx))!)).toBe(
      '{\n"a": 1\n}\n',
    );

    const already = new TextEncoder().encode('{"a": 1}\n');
    expect(await normalizeText.transform!(already, file, ctx)).toBeNull();
  });
});

describe("validate-json processor", () => {
  it("passes valid json, throws on invalid in dev, skips in release", async () => {
    const file = packFile();
    const ok = new TextEncoder().encode('{"a": 1}');
    expect(await validateJson.transform!(ok, file, { release: false })).toBeNull();
    expect(await validateJson.transform!(ok, file, { release: true })).toBeNull();
    const bad = new TextEncoder().encode('{"a": }');
    expect(() => validateJson.transform!(bad, file, { release: false })).toThrow();
    expect(await validateJson.transform!(bad, file, { release: true })).toBeNull();
  });
});

describe("default processor order", () => {
  it("ends with the raw-copy fallback", async () => {
    const { defaultProcessors } = await import("../src/pipeline/processors/index.js");
    expect(defaultProcessors.length).toBeGreaterThan(0);
    expect(defaultProcessors[defaultProcessors.length - 1]!.name).toBe("raw-copy");
    expect(resolveProcessors().map((p) => p.name)).toEqual(defaultProcessors.map((p) => p.name));
  });
});
