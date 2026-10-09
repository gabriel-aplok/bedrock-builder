import { join } from "node:path";

import { listTree } from "../files/tree.js";
import type { PipelineFile } from "./types.js";

export async function collectFiles(
  from: string,
  into: string,
  kind: "BP" | "RP",
  skipScripts: boolean,
): Promise<PipelineFile[]> {
  const found: PipelineFile[] = [];
  for (const entry of await listTree(from)) {
    if (skipScripts && isTopScripts(entry.rel)) continue;
    found.push({
      src: entry.abs,
      dst: join(into, ...entry.rel.split("/")),
      rel: entry.rel,
      kind,
      size: entry.size,
      mtimeMs: entry.mtimeMs,
    });
  }
  return found;
}

function isTopScripts(rel: string): boolean {
  if (rel === "scripts" || rel === "scripts/") return true;
  const cut = rel.indexOf("/");
  return cut === -1 ? rel === "scripts" : rel.slice(0, cut) === "scripts";
}
