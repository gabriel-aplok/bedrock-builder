import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import extFactory from "../extensions/emissive-fixer/index.mjs";
import { decodePng } from "../extensions/emissive-fixer/lib/png-decode.mjs";

const ext = (
  extFactory as (api: { decodePng: typeof decodePng }) => {
    name: string;
    match: (file: { rel: string }) => boolean;
    transform: (
      content: Uint8Array,
      file: { rel: string },
      ctx: { release: boolean },
    ) => Promise<Uint8Array | null> | Uint8Array | null;
  }
)({ decodePng });

async function blankPng(): Promise<Uint8Array> {
  // smallest valid rgba png: 1x1 opaque white, filter 0.
  const { deflateSync } = await import("node:zlib");
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.from([0, 255, 255, 255, 255]);
  const mk = (type: string, data: Uint8Array): Buffer => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, "ascii");
    Buffer.from(data).copy(out, 8);
    return out;
  };
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      mk("IHDR", ihdr),
      mk("IDAT", deflateSync(raw)),
      mk("IEND", Buffer.alloc(0)),
    ]),
  );
}

describe("emissive-fixer", () => {
  it("matches png files only", () => {
    expect(ext.match({ rel: "textures/a.png" } as never)).toBe(true);
    expect(ext.match({ rel: "x.json" } as never)).toBe(false);
  });

  it("loads through the real loader from a project dir", async () => {
    const { mkdtemp, rm, cp, mkdir } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { clearProcessors, customProcessors } = await import("../src/index.js");
    const { loadExtensions } = await import("../src/pipeline/loader.js");
    clearProcessors();
    const project = await mkdtemp(join(tmpdir(), "bb-ext-proj-"));
    try {
      await mkdir(join(project, ".builder", "extensions", "emissive-fixer"), { recursive: true });
      await cp(
        "extensions/emissive-fixer/index.mjs",
        join(project, ".builder", "extensions", "emissive-fixer", "index.mjs"),
      );
      await cp(
        "extensions/emissive-fixer/lib",
        join(project, ".builder", "extensions", "emissive-fixer", "lib"),
        { recursive: true },
      );
      await cp(
        "extensions/emissive-fixer/extension.json",
        join(project, ".builder", "extensions", "emissive-fixer", "extension.json"),
      );
      // no node_modules here: factory form needs no installed dep.
      const report = await loadExtensions({
        extensions: ["emissive-fixer"],
        __configDir: project,
      } as never);
      expect(report.loaded).toBe(1);
      expect(customProcessors().some((s) => s.name === "emissive-fixer")).toBe(true);
    } finally {
      await rm(project, { recursive: true, force: true });
      clearProcessors();
    }
  });

  it("returns null when nothing needs fixing", async () => {
    const png = await blankPng();
    const out = await ext.transform!(png, { rel: "a.png" } as never, { release: false });
    expect(out).toBeNull();
  });

  it("fixes a dirty transparent pixel", async () => {
    // craft a png with one transparent red pixel via the extension encoder.
    const { deflateSync } = await import("node:zlib");
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(1, 0);
    ihdr.writeUInt32BE(1, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    const raw = Buffer.from([0, 255, 0, 0, 0]);
    const mk = (type: string, data: Uint8Array): Buffer => {
      const out = Buffer.alloc(12 + data.length);
      out.writeUInt32BE(data.length, 0);
      out.write(type, 4, "ascii");
      Buffer.from(data).copy(out, 8);
      return out;
    };
    const dirty = new Uint8Array(
      Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        mk("IHDR", ihdr),
        mk("IDAT", deflateSync(raw)),
        mk("IEND", Buffer.alloc(0)),
      ]),
    );
    const fixed = await ext.transform!(dirty, { rel: "a.png" } as never, { release: false });
    expect(fixed).not.toBeNull();
    const back = decodePng(fixed!);
    expect([...back.data]).toEqual([0, 0, 0, 0]);
  });
});
