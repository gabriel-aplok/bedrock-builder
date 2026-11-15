import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { isRecord } from "./records.js";

const FALLBACK_VERSION = "0.0.0";
const PACKAGE_NAME = "@aplok/bedrock-builder";

// read the builder version from the nearest package.json.
export async function packageVersion(): Promise<string> {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const file of [
    resolve(here, "..", "package.json"),
    resolve(here, "..", "..", "package.json"),
  ]) {
    try {
      const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
      if (
        isRecord(parsed) &&
        parsed.name === PACKAGE_NAME &&
        typeof parsed.version === "string" &&
        parsed.version.trim() !== ""
      ) {
        return parsed.version.trim();
      }
    } catch {}
  }
  return FALLBACK_VERSION;
}
