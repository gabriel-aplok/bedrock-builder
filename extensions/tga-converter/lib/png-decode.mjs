// vendored png decoder, kept local so the extension has no core dependency.
import { inflateSync } from "node:zlib";
const PNG_MAGIC = [137, 80, 78, 71, 13, 10, 26, 10];
function u32(bytes, at) {
  return (
    (bytes[at] * 2 ** 24 + bytes[at + 1] * 2 ** 16 + bytes[at + 2] * 2 ** 8 + bytes[at + 3]) >>> 0
  );
}
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}
function decodePng(bytes) {
  for (let i = 0; i < PNG_MAGIC.length; i++) {
    if (bytes[i] !== PNG_MAGIC[i]) throw new Error("not a png file");
  }
  let at = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  let palette = null;
  let transparency = null;
  while (at + 8 <= bytes.length) {
    const length = u32(bytes, at);
    const type = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]);
    const data = bytes.slice(at + 8, at + 8 + length);
    if (type === "IHDR") {
      width = u32(data, 0);
      height = u32(data, 4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[10] !== 0 || data[11] !== 0 || data[12] !== 0) {
        throw new Error("unsupported png compression");
      }
    } else if (type === "PLTE") {
      palette = data;
    } else if (type === "tRNS") {
      transparency = data;
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    at += 12 + length;
  }
  if (width === 0 || height === 0) throw new Error("png missing IHDR");
  if (bitDepth !== 8) throw new Error(`unsupported png bit depth ${bitDepth}`);
  if (![0, 2, 3, 4, 6].includes(colorType))
    throw new Error(`unsupported png color type ${colorType}`);
  const joined = Buffer.concat(idat.map((part) => Buffer.from(part)));
  const filtered = new Uint8Array(inflateSync(joined));
  const channels =
    colorType === 0 || colorType === 3 ? 1 : colorType === 4 ? 2 : colorType === 2 ? 3 : 4;
  const stride = width * channels;
  const plain = new Uint8Array(width * height * channels);
  let read = 0;
  for (let y = 0; y < height; y++) {
    const filter = filtered[read++];
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? plain[y * stride + x - channels] : 0;
      const b = y > 0 ? plain[(y - 1) * stride + x] : 0;
      const c = y > 0 && x >= channels ? plain[(y - 1) * stride + x - channels] : 0;
      const v = filtered[read++];
      switch (filter) {
        case 0:
          plain[y * stride + x] = v;
          break;
        case 1:
          plain[y * stride + x] = (v + a) & 255;
          break;
        case 2:
          plain[y * stride + x] = (v + b) & 255;
          break;
        case 3:
          plain[y * stride + x] = (v + ((a + b) >> 1)) & 255;
          break;
        case 4:
          plain[y * stride + x] = (v + paeth(a, b, c)) & 255;
          break;
        default:
          throw new Error(`unsupported png filter ${filter}`);
      }
    }
  }
  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const base = i * channels;
    const px = i * 4;
    if (colorType === 0) {
      const v = plain[base];
      out[px] = v;
      out[px + 1] = v;
      out[px + 2] = v;
      out[px + 3] = 255;
    } else if (colorType === 2) {
      out[px] = plain[base];
      out[px + 1] = plain[base + 1];
      out[px + 2] = plain[base + 2];
      out[px + 3] = 255;
    } else if (colorType === 3) {
      if (!palette) throw new Error("indexed png without palette");
      const index = plain[base] * 3;
      out[px] = palette[index];
      out[px + 1] = palette[index + 1];
      out[px + 2] = palette[index + 2];
      out[px + 3] = transparency?.[plain[base]] ?? 255;
    } else if (colorType === 4) {
      const v = plain[base];
      out[px] = v;
      out[px + 1] = v;
      out[px + 2] = v;
      out[px + 3] = plain[base + 1];
    } else {
      out[px] = plain[base];
      out[px + 1] = plain[base + 1];
      out[px + 2] = plain[base + 2];
      out[px + 3] = plain[base + 3];
    }
  }
  return { width, height, data: out };
}
export { decodePng };
