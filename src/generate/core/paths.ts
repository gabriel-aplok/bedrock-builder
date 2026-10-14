import { relative } from "node:path";

import type { BedrockConfig } from "../../config.js";

export interface PackRoots {
  bpRel: string;
  rpRel: string;
}

function relTo(base: string, abs: string): string {
  return relative(base, abs).replace(/\\/g, "/");
}

export function packRoots(config: BedrockConfig): PackRoots {
  return {
    bpRel: relTo(config.__configDir, config.packs.bp),
    rpRel: relTo(config.__configDir, config.packs.rp),
  };
}
