import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { collectDir, crc32, writeZip } from "../src/pack/zip.js";

// minimal central directory parser, enough to verify our output.
function parseCentral(zip: Buffer): {
  name: string;
  method: number;
  crc: number;
  size: number;
  compressed: number;
  offset: number;
}[] {
  const eocd = zip.length - 22;
  if (zip.readUInt32LE(eocd) !== 0x06054b50) throw new Error("missing eocd");
  const count = zip.readUInt16LE(eocd + 10);
  let at = zip.readUInt32LE(eocd + 16);
  const out = [];
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(at) !== 0x02014b50) throw new Error("bad central header");
    const nameLen = zip.readUInt16LE(at + 28);
    const extraLen = zip.readUInt16LE(at + 30);
    const commentLen = zip.readUInt16LE(at + 32);
    out.push({
      name: zip.subarray(at + 46, at + 46 + nameLen).toString("utf8"),
      method: zip.readUInt16LE(at + 10),
      crc: zip.readUInt32LE(at + 16),
      compressed: zip.readUInt32LE(at + 20),
      size: zip.readUInt32LE(at + 24),
      offset: zip.readUInt32LE(at + 42),
    });
    at += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

describe("zip writer", () => {
  it("writes crc32 matching known vectors", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
    expect(crc32(Buffer.alloc(0))).toBe(0);
  });

  it("round-trips deflated and stored entries", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bb-zip-"));
    try {
      const out = join(dir, "test.mcaddon");
      const payload = Buffer.from("hello bedrock ".repeat(100));
      await writeZip(
        out,
        [
          { name: "pack_BP/manifest.json", data: new Uint8Array(payload), dir: false },
          { name: "pack_BP/empty/", data: new Uint8Array(0), dir: true },
        ],
        6,
      );
      const zip = await readFile(out);
      const entries = parseCentral(zip);
      expect(entries.map((entry) => entry.name)).toEqual([
        "pack_BP/manifest.json",
        "pack_BP/empty/",
      ]);
      const file = entries[0]!;
      expect(file.method).toBe(8);
      // local header points at the same data the central directory describes.
      const localNameLen = zip.readUInt16LE(file.offset + 26);
      const localExtraLen = zip.readUInt16LE(file.offset + 28);
      const dataAt = file.offset + 30 + localNameLen + localExtraLen;
      const raw = zip.subarray(dataAt, dataAt + file.compressed);
      const back = inflateRawSync(raw);
      expect(Buffer.from(back)).toEqual(payload);
      expect(file.crc).toBe(crc32(new Uint8Array(payload)));
      expect(entries[1]!.method).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("collects a directory tree with sorted names", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bb-zip-"));
    try {
      const { mkdir, writeFile } = await import("node:fs/promises");
      await mkdir(join(dir, "BP", "items"), { recursive: true });
      await writeFile(join(dir, "BP", "b.json"), "{}");
      await writeFile(join(dir, "BP", "a.json"), "{}");
      await writeFile(join(dir, "BP", "items", "c.json"), "{}");
      const entries = await collectDir(join(dir, "BP"), "test_BP");
      expect(entries.map((entry) => entry.name)).toEqual([
        "test_BP/a.json",
        "test_BP/b.json",
        "test_BP/items/",
        "test_BP/items/c.json",
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
