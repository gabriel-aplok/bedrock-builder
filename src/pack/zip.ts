// minimal zip writer for .mcaddon files. replaces the archiver
// dependency, local headers plus deflate data plus central
// directory, enough for minecraft and standard unzip tools
// just avoiding supply chains lol.

import { createWriteStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";

const TABLE = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  TABLE[n] = c;
}

export function crc32(data: Uint8Array): number {
  let c = -1;
  for (const byte of data) c = TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
  dir: boolean;
}

export interface ZipProgress {
  files: number;
}

function header(size: number, signature: number): Buffer {
  const out = Buffer.alloc(size);
  out.writeUInt32LE(signature, 0);
  return out;
}

function dosTime(date = new Date()): { time: number; date: number } {
  return {
    time:
      ((date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)) >>>
      0,
    date:
      (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) >>> 0,
  };
}

// collect a directory tree as posix zip names under prefix.
export async function collectDir(root: string, prefix: string): Promise<ZipEntry[]> {
  const out: ZipEntry[] = [];
  const walk = async (dir: string, rel: string): Promise<void> => {
    const names = await readdir(dir);
    names.sort();
    for (const name of names) {
      const full = join(dir, name);
      const info = await stat(full);
      const zipName = rel === "" ? `${prefix}/${name}` : `${rel}/${name}`;
      if (info.isDirectory()) {
        out.push({ name: `${zipName}/`, data: new Uint8Array(0), dir: true });
        await walk(full, zipName);
      } else if (info.isFile()) {
        const { readFile } = await import("node:fs/promises");
        out.push({ name: zipName, data: new Uint8Array(await readFile(full)), dir: false });
      }
    }
  };
  await walk(root, prefix);
  return out;
}

export async function writeZip(
  output: string,
  entries: ZipEntry[],
  level: number,
  onEntry?: (progress: ZipProgress) => void,
): Promise<{ files: number; bytes: number }> {
  const stream = createWriteStream(output);
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  let files = 0;
  const { time, date } = dosTime();

  const write = (chunk: Buffer): void => {
    chunks.push(chunk);
    offset += chunk.length;
  };

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const body = entry.dir
      ? Buffer.alloc(0)
      : level === 0
        ? Buffer.from(entry.data)
        : deflateRawSync(entry.data, { level });
    const crc = crc32(entry.data);
    const method = entry.dir || level === 0 ? 0 : 8;

    const local = header(30, 0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const localOffset = offset;
    write(local);
    write(name);
    write(body);

    const attrs = entry.dir ? 0x10 : 0x20;
    const centralHeader = header(46, 0x02014b50);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(time, 12);
    centralHeader.writeUInt16LE(date, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(body.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE((0o644 << 16) | attrs, 38);
    centralHeader.writeUInt32LE(localOffset, 42);
    central.push(centralHeader, name);

    if (!entry.dir) {
      files++;
      onEntry?.({ files });
    }
  }

  const centralStart = offset;
  let centralSize = 0;
  for (const chunk of central) {
    chunks.push(chunk);
    centralSize += chunk.length;
  }
  offset += centralSize;
  const end = header(22, 0x06054b50);
  end.writeUInt16LE(central.length / 2, 8);
  end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralStart, 16);
  chunks.push(end);

  await new Promise<void>((resolve, reject) => {
    stream.on("error", reject);
    stream.on("close", () => resolve());
    for (const chunk of chunks) stream.write(chunk);
    stream.end();
  });
  const bytes = offset + 22;
  return { files, bytes };
}
