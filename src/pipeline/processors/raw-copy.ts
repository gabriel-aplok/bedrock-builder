import type { FileProcessor } from "../types.js";

const TEXT_ENDINGS = new Set([
  ".json",
  ".jsonc",
  ".mcfunction",
  ".lang",
  ".txt",
  ".md",
  ".js",
  ".ts",
  ".html",
  ".xml",
]);

export const rawCopy: FileProcessor = {
  name: "raw-copy",
  match: () => true,
};

export function isTextFile(rel: string): boolean {
  const dot = rel.lastIndexOf(".");
  if (dot < 0) return false;
  return TEXT_ENDINGS.has(rel.slice(dot).toLowerCase());
}
