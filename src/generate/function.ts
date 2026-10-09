import type { BedrockConfig } from "../config.js";
import { openPlan } from "./core/setup.js";
import type { Tree } from "./core/tree.js";
import type { CreateOptions, GeneratorResult } from "./core/types.js";

export function planFunction(
  tree: Tree,
  config: BedrockConfig,
  opts: CreateOptions,
): GeneratorResult {
  const scope = openPlan(config, opts);
  const { raw, bpRel } = scope;
  const body = opts.commandLine?.trim() || "say hello";

  tree.write(`${bpRel}/functions/${raw}.mcfunction`, `${body}\n`);
  return { notes: [`Run it with /function ${raw}.`] };
}
