import type { FileProcessor } from "../types.js";
import { isTextFile } from "./raw-copy.js";

export const normalizeText: FileProcessor = {
  name: "normalize-text",
  match: (file) => isTextFile(file.rel),
  transform: (content) => {
    let text = new TextDecoder("utf-8", { fatal: false }).decode(content);
    let dirty = false;
    if (text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1);
      dirty = true;
    }
    if (text.includes("\r")) {
      text = text.replace(/\r\n?/g, "\n");
      dirty = true;
    }
    return dirty ? new TextEncoder().encode(text) : null;
  },
};
