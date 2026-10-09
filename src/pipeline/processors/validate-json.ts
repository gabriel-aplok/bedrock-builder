import type { FileProcessor, PipelineFile } from "../types.js";

function isJson(file: PipelineFile): boolean {
  const path = file.rel.toLowerCase();
  return path.endsWith(".json") || path.endsWith(".jsonc");
}

export const validateJson: FileProcessor = {
  name: "validate-json",
  match: isJson,
  transform: (content, _file, ctx) => {
    if (ctx.release) return null;
    try {
      JSON.parse(new TextDecoder("utf-8", { fatal: false }).decode(content));
    } catch (err) {
      throw new Error(`invalid json: ${err instanceof Error ? err.message : String(err)}`);
    }
    return null;
  },
};
