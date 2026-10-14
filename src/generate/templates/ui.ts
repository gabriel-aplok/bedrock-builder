import { renderJson } from "./serialize.js";

export interface UiTemplateOptions {
  namespace: string;
}

export function renderUiScreenJson(opts: UiTemplateOptions): string {
  return renderJson({
    namespace: opts.namespace,
    [opts.namespace]: {
      type: "panel",
      size: ["100%", "100%"],
    },
  });
}
