import { renderJson } from "./serialize.js";

export interface AnimationTemplateOptions {
  controller: string;
  animation: string;
}

export function renderAnimationJson(opts: AnimationTemplateOptions): string {
  return renderJson({
    format_version: "1.10.0",
    animation_controllers: {
      [opts.controller]: {
        initial_state: "default",
        states: {
          default: {
            animations: [opts.animation],
            transitions: [{ playing: "query.is_moving" }],
          },
          playing: {
            animations: [opts.animation],
            transitions: [{ default: "!query.is_moving" }],
          },
        },
      },
    },
  });
}
