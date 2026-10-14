import type { BedrockConfig } from "../config.js";
import { openPlan } from "./core/setup.js";
import { mergeUiDefs } from "./core/registries.js";
import type { Tree } from "./core/tree.js";
import type { CreateOptions, GeneratorResult } from "./core/types.js";
import { renderUiScreenJson } from "./templates/ui.js";

export function planUi(tree: Tree, config: BedrockConfig, opts: CreateOptions): GeneratorResult {
  const scope = openPlan(config, opts);
  const { raw, names: n, rpRel } = scope;
  const screenPath = `ui/${raw}.json`;

  tree.write(`${rpRel}/${screenPath}`, renderUiScreenJson({ namespace: n.namespace }));
  const registered = mergeUiDefs(tree, rpRel, screenPath);

  const notes = [`Screen file written at RP/${screenPath}.`];
  if (!registered) {
    notes.push(`Add "${screenPath}" to RP/ui/_ui_defs.json by hand, the file could not be merged.`);
  } else {
    notes.push(`Registered in RP/ui/_ui_defs.json. Extend a vanilla screen to show it.`);
  }
  return { notes };
}
