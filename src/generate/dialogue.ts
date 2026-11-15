import type { BedrockConfig } from "../config.js";
import { openPlan } from "./core/setup.js";
import type { Tree } from "./core/tree.js";
import type { CreateOptions, GeneratorResult } from "./core/types.js";
import { renderDialogueJson } from "./templates/dialogue.js";

export function planDialogue(
  tree: Tree,
  config: BedrockConfig,
  opts: CreateOptions,
): GeneratorResult {
  const scope = openPlan(config, opts);
  const { raw, names: n, bpRel } = scope;
  const text = opts.dialogueText?.trim() || `Hello, I am ${n.displayName}.`;
  const button = opts.dialogueButton?.trim() || "Close";

  tree.write(
    `${bpRel}/dialogue/${raw}.json`,
    renderDialogueJson({
      scene: `${n.namespace}:${raw}`,
      npc: n.displayName,
      text,
      button,
    }),
  );
  return { notes: [`Wire the scene ${n.namespace}:${raw} to an NPC.`] };
}
