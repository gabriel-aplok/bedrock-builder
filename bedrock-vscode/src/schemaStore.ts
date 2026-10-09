import { gunzipSync } from "node:zlib";

import { CATALOG_FILE, SCHEMAS_PREFIX } from "./constants.js";

export interface TarEntry {
  name: string;
  data: Buffer;
}

export interface CatalogEntry {
  name: string;
  fileMatch: string[];
  url: string;
}

export interface SchemaCatalog {
  schemas: CatalogEntry[];
}

const BLOCK = 512;
const NAME_LEN = 100;
const SIZE_OFF = 124;
const SIZE_LEN = 12;

// parse a gzip tarball, keep only schema json plus the catalog.
// other entries are skipped without storing bytes.
export function parseTarball(tgz: Buffer): TarEntry[] {
  const tar = Buffer.from(gunzipSync(tgz));
  const kept: TarEntry[] = [];
  let at = 0;
  while (at + BLOCK <= tar.length) {
    const head = tar.subarray(at, at + BLOCK);
    if (head.every((byte) => byte === 0)) break;
    const name = head.subarray(0, NAME_LEN).toString("utf8").replace(/\0.*$/, "");
    const sizeText = head
      .subarray(SIZE_OFF, SIZE_OFF + SIZE_LEN)
      .toString("utf8")
      .replace(/\0.*$/, "")
      .trim();
    const size = sizeText === "" ? 0 : Number.parseInt(sizeText, 8);
    if (!Number.isSafeInteger(size) || size < 0) throw new Error(`Bad tar size for ${name}.`);
    const dataAt = at + BLOCK;
    const data = tar.subarray(dataAt, dataAt + size);
    if (data.length !== size) throw new Error(`Truncated tar entry ${name}.`);
    if (wanted(name)) kept.push({ name, data: Buffer.from(data) });
    at = dataAt + Math.ceil(size / BLOCK) * BLOCK;
  }
  return kept;
}

function wanted(name: string): boolean {
  if (name === CATALOG_FILE) return true;
  if (!name.startsWith(SCHEMAS_PREFIX)) return false;
  return name.endsWith(".json");
}

// catalog urls are package relative, keep only ./schemas/* rows.
export function catalogToLocalSchemas(
  catalog: SchemaCatalog,
): { fileMatch: string[]; url: string }[] {
  return catalog.schemas
    .filter((entry) => entry.url.startsWith("./schemas/"))
    .map((entry) => ({ fileMatch: [...entry.fileMatch], url: entry.url }));
}

// map a catalog url to a path under the versioned store dir.
// null means the url points outside the schema tree.
export function storePathForSchemaUrl(url: string): string | null {
  if (!url.startsWith("./schemas/")) return null;
  const rest = url.slice("./schemas/".length);
  if (rest === "" || rest.includes("..")) return null;
  return `schemas/${rest}`;
}
