import { renderJson } from "./serialize.js";

export interface DialogueTemplateOptions {
  scene: string;
  npc: string;
  text: string;
  button: string;
}

export function renderDialogueJson(opts: DialogueTemplateOptions): string {
  return renderJson({
    format_version: "1.17.0",
    "minecraft:npc_dialogue": {
      scenes: [
        {
          scene_tag: opts.scene,
          npc_name: opts.npc,
          text: opts.text,
          buttons: [{ name: opts.button, commands: [] }],
        },
      ],
    },
  });
}
