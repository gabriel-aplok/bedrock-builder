import { deflateSync } from "node:zlib";
import { decodePng } from "./lib/png-decode.mjs";

const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}

function crc(bytes) {
  let c = -1;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(
    crc(Buffer.concat([Buffer.from(type, "ascii"), Buffer.from(data)])),
    8 + data.length,
  );
  return out;
}

// minimal rgba encoder, 8-bit truecolor with alpha, filter 0 per row.
function encodePng(image) {
  const { width, height, data } = image;
  const rows = [];
  for (let y = 0; y < height; y++) {
    rows.push(0);
    for (let x = 0; x < width * 4; x++) {
      rows.push(data[y * width * 4 + x]);
    }
  }
  const magic = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    magic,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.from(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function isPng(rel) {
  return rel.toLowerCase().endsWith(".png");
}

export default function emissiveFixer({ settings = {} }) {
  const stripPackIcons = settings.stripPackIcons === true;
  return {
    name: "emissive-fixer",
    match: (file) => isPng(file.rel) && (stripPackIcons || !file.rel.endsWith("pack_icon.png")),
    transform: (content) => {
      let image;
      try {
        image = decodePng(content);
      } catch {
        return null;
      }
      let fixed = 0;
      for (let i = 0; i < image.data.length; i += 4) {
        if (image.data[i + 3] !== 0) continue;
        if (image.data[i] === 0 && image.data[i + 1] === 0 && image.data[i + 2] === 0) continue;
        image.data[i] = 0;
        image.data[i + 1] = 0;
        image.data[i + 2] = 0;
        fixed++;
      }
      if (fixed === 0) return null;
      return new Uint8Array(encodePng(image));
    },
  };
}
