import type { FileProcessor } from "../types.js";
import { normalizeText } from "./normalize-text.js";
import { rawCopy } from "./raw-copy.js";
import { validateJson } from "./validate-json.js";

export const defaultProcessors: FileProcessor[] = [normalizeText, validateJson, rawCopy];

export function isFallback(stage: FileProcessor): boolean {
  return stage === rawCopy;
}
