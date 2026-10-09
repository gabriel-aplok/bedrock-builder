import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const outDir = join(root, "docs", "assets");

// one mark definition drives both svg and png output.
const MARK = {
  size: 512,
  bg: [0, 0, 0],
  fg: [255, 255, 255],
  radius: 112,
  width: 46,
  stems: [
    { x: 150, top: 140, bottom: 372 },
    { x: 330, top: 140, bottom: 372 },
  ],
  bowls: [
    { x: 150, top: 212, r: 66 },
    { x: 330, top: 212, r: 66 },
  ],
};

function bowlSegments(bowl, steps = 24) {
  const pts = [{ x: bowl.x, y: bowl.top }];
  const cx = bowl.x + 56;
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / steps;
    pts.push({
      x: cx + bowl.r * Math.cos(a) * 1.0,
      y: bowl.top + bowl.r + bowl.r * Math.sin(a),
    });
  }
  pts.push({ x: bowl.x, y: bowl.top + bowl.r * 2 });
  return pts;
}

function segments() {
  const segs = [];
  for (const s of MARK.stems) {
    segs.push([
      { x: s.x, y: s.top },
      { x: s.x, y: s.bottom },
    ]);
  }
  for (const b of MARK.bowls) {
    const line = { x: b.x + 56, y: b.top };
    segs.push([{ x: b.x, y: b.top }, line]);
    const arc = bowlSegments(b);
    for (let i = 0; i < arc.length - 1; i++) {
      segs.push([arc[i], arc[i + 1]]);
    }
    segs.push([
      { x: b.x, y: b.top + b.r * 2 },
      { x: b.x + 56, y: b.top + b.r * 2 },
    ]);
  }
  return segs;
}

function distToSeg(px, py, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - a.x) * dx + (py - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * dx - px;
  const cy = a.y + t * dy - py;
  return Math.sqrt(cx * cx + cy * cy);
}

function renderMark(pxSize, bg, centerX = 0.5, centerY = 0.5, tile = true) {
  const S = 4;
  const W = pxSize * S;
  const buf = Buffer.alloc(W * W * 4);
  const segs = segments();
  const k = (pxSize / MARK.size) * S;
  const half = (MARK.width / 2) * k;
  const ox = pxSize * S * centerX - (MARK.size / 2) * k;
  const oy = pxSize * S * centerY - (MARK.size / 2) * k;
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const mx = (x - ox) / k;
      const my = (y - oy) / k;
      let d = Infinity;
      for (const [a, b] of segs) {
        const v = distToSeg(mx, my, a, b);
        if (v < d) d = v;
      }
      const inStroke = d * k <= half + 0.4;
      // rounded tile clip, transparent outside.
      const qx = Math.abs(mx - 256) - (256 - MARK.radius);
      const qy = Math.abs(my - 256) - (256 - MARK.radius);
      const ax = Math.max(qx, 0);
      const ay = Math.max(qy, 0);
      const sd = Math.sqrt(ax * ax + ay * ay) + Math.min(Math.max(qx, qy), 0) - MARK.radius;
      const i = (y * W + x) * 4;
      if (!tile) {
        if (inStroke) {
          buf[i] = 255;
          buf[i + 1] = 255;
          buf[i + 2] = 255;
          buf[i + 3] = 255;
        } else {
          buf[i + 3] = 0;
        }
        continue;
      }
      if (sd > 0.5) {
        buf[i + 3] = 0;
        continue;
      }
      if (inStroke) {
        buf[i] = 255;
        buf[i + 1] = 255;
        buf[i + 2] = 255;
      } else {
        buf[i] = bg[0];
        buf[i + 1] = bg[1];
        buf[i + 2] = bg[2];
      }
      buf[i + 3] = 255;
    }
  }
  // box downsample to target size.
  const out = Buffer.alloc(pxSize * pxSize * 4);
  for (let y = 0; y < pxSize; y++) {
    for (let x = 0; x < pxSize; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let dy = 0; dy < S; dy++) {
        for (let dx = 0; dx < S; dx++) {
          const i = ((y * S + dy) * W + (x * S + dx)) * 4;
          r += buf[i];
          g += buf[i + 1];
          b += buf[i + 2];
          a += buf[i + 3];
        }
      }
      const o = (y * pxSize + x) * 4;
      out[o] = Math.round(r / (S * S));
      out[o + 1] = Math.round(g / (S * S));
      out[o + 2] = Math.round(b / (S * S));
      out[o + 3] = Math.round(a / (S * S));
    }
  }
  return out;
}

function crc(table, bytes) {
  let c = -1;
  for (const v of bytes) c = table[(c ^ v) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function png(width, height, rgba) {
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
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rows = [];
  for (let y = 0; y < height; y++) {
    rows.push(Buffer.from([0]));
    rows.push(rgba.subarray(y * width * 4, (y + 1) * width * 4));
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

await mkdir(outDir, { recursive: true });
const bannerSource = join(outDir, "og-banner-source.png");
for (const size of [16, 32, 180, 192, 512]) {
  await copyFile(join(outDir, `icon-${size}-source.png`), join(outDir, `icon-${size}.png`));
}
await copyFile(join(outDir, "icon-180-source.png"), join(outDir, "apple-touch-icon.png"));
await copyFile(bannerSource, join(outDir, "og-banner.png"));
await writeFile(
  join(outDir, "site.webmanifest"),
  JSON.stringify(
    {
      name: "Bedrock Builder",
      short_name: "Bedrock Builder",
      description: "Build tools for Minecraft Bedrock add-ons.",
      start_url: "/",
      display: "standalone",
      background_color: "#000000",
      theme_color: "#000000",
      icons: [
        { src: "assets/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "assets/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
    },
    null,
    2,
  ) + "\n",
);
console.log("wrote docs/assets icons plus banner");
