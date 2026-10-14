// builds the 128px marketplace icon from the 512px docs art.
// pure node, no image dependencies. 512 to 128 is an exact 4:1 box average.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, inflateSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const SOURCE_SIZE = 512;
const ICON_SIZE = 128;
const BLOCK = SOURCE_SIZE / ICON_SIZE;

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

// minimal decoder: 8-bit rgb/rgba, no interlace. enough for our own art.
function decodePng(raw) {
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  const depth = view.getUint8(24);
  const color = view.getUint8(25);
  const interlace = view.getUint8(28);
  if (width !== SOURCE_SIZE || height !== SOURCE_SIZE || depth !== 8 || interlace !== 0) {
    throw new Error(
      `unexpected source png: ${width}x${height} depth ${depth} interlace ${interlace}`,
    );
  }
  const channels = color === 6 ? 4 : color === 2 ? 3 : 0;
  if (channels === 0) throw new Error(`unsupported color type ${color}`);
  const idat = [];
  let at = 8;
  while (at < raw.length) {
    const length = view.getUint32(at);
    const type = raw.subarray(at + 4, at + 8).toString("ascii");
    if (type === "IDAT") idat.push(raw.subarray(at + 8, at + 8 + length));
    at += 12 + length;
  }
  const data = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const rows = Buffer.alloc(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = data[pos++];
    for (let x = 0; x < stride; x++) {
      const rawByte = data[pos++];
      const left = x >= channels ? rows[y * stride + x - channels] : 0;
      const up = y > 0 ? rows[(y - 1) * stride + x] : 0;
      const upperLeft = x >= channels && y > 0 ? rows[(y - 1) * stride + x - channels] : 0;
      let value = rawByte;
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) value += paeth(left, up, upperLeft);
      rows[y * stride + x] = value & 0xff;
    }
  }
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    out[i * 4] = rows[i * channels];
    out[i * 4 + 1] = rows[i * channels + 1];
    out[i * 4 + 2] = rows[i * channels + 2];
    out[i * 4 + 3] = channels === 4 ? rows[i * channels + 3] : 255;
  }
  return out;
}

function average(src) {
  const out = Buffer.alloc(ICON_SIZE * ICON_SIZE * 4);
  for (let y = 0; y < ICON_SIZE; y++) {
    for (let x = 0; x < ICON_SIZE; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let dy = 0; dy < BLOCK; dy++) {
        for (let dx = 0; dx < BLOCK; dx++) {
          const i = ((y * BLOCK + dy) * SOURCE_SIZE + (x * BLOCK + dx)) * 4;
          r += src[i];
          g += src[i + 1];
          b += src[i + 2];
          a += src[i + 3];
        }
      }
      const o = (y * ICON_SIZE + x) * 4;
      const n = BLOCK * BLOCK;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
      out[o + 3] = Math.round(a / n);
    }
  }
  return out;
}

function crc(table, bytes) {
  let c = -1;
  for (const v of bytes) c = table[(c ^ v) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function encodePng(rgba) {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, "ascii");
    Buffer.from(data).copy(out, 8);
    out.writeUInt32BE(
      crc(table, Buffer.concat([Buffer.from(type, "ascii"), Buffer.from(data)])),
      8 + data.length,
    );
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ICON_SIZE, 0);
  ihdr.writeUInt32BE(ICON_SIZE, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rows = [];
  for (let y = 0; y < ICON_SIZE; y++) {
    rows.push(Buffer.from([0]));
    rows.push(rgba.subarray(y * ICON_SIZE * 4, (y + 1) * ICON_SIZE * 4));
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const source = await readFile(join(root, "docs", "assets", "icon-512.png"));
const target = join(root, "bedrock-vscode", "images", "icon.png");
await mkdir(dirname(target), { recursive: true });
await writeFile(target, encodePng(average(decodePng(source))));
console.log(`wrote ${target}`);
