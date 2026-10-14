import type { BedrockConfig } from "../config.js";
import { openPlan } from "./core/setup.js";
import { mergeSoundDefinition } from "./core/registries.js";
import type { Tree } from "./core/tree.js";
import type { CreateOptions, GeneratorResult } from "./core/types.js";

export function planSound(tree: Tree, config: BedrockConfig, opts: CreateOptions): GeneratorResult {
  const scope = openPlan(config, opts);
  const { raw, names: n, rpRel } = scope;
  const sound = opts.result?.trim() || `${n.namespace}.${raw}`;
  const soundPath = opts.soundFile?.trim() || `sounds/${raw}`;

  mergeSoundDefinition(tree, rpRel, sound, soundPath);
  return { notes: [`Drop the audio at RP/${soundPath}.ogg, then play ${sound}.`] };
}
