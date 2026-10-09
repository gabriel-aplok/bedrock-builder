import { describe, expect, it } from "vitest";
import { deflateSync } from "node:zlib";
import converter from "../extensions/tga-converter/index.mjs";

function redPng(): Uint8Array {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const chunk = (type: string, data: Buffer): Buffer => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4);
    return Buffer.concat([head, data, Buffer.alloc(4)]);
  };
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(Buffer.from([0, 255, 0, 0, 255]))),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

describe("tga-converter extension", () => {
  it("matches texture sources but not pack icons", () => {
    const ext = converter;
    expect(ext.match({ rel: "textures/a.png" } as never)).toBe(true);
    expect(ext.match({ rel: "pack_icon.png" } as never)).toBe(false);
    expect(ext.remap!({ dst: "dist/a.png" } as never)).toBe("dist/a.tga");
  });

  it("converts png bytes without loading jpeg-js", async () => {
    const out = await converter.transform!(redPng(), { rel: "textures/a.png" } as never, {
      release: false,
    });
    expect(out![2]).toBe(2);
    expect(out!.length).toBe(22);
  });
});
