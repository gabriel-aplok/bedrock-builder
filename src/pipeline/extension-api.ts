import { defineProcessor, registerProcessor } from "./extensions.js";
import type { BundleContext, FileProcessor, PipelineFile, ProcessorContext } from "./types.js";

export interface ExtensionApi {
  register: typeof registerProcessor;
  settings: Readonly<Record<string, unknown>>;
}

export function createExtensionApi(settings: Record<string, unknown>): ExtensionApi {
  return { register: registerProcessor, settings };
}

export function withExtensionSettings(
  stage: FileProcessor,
  settings: Record<string, unknown>,
): FileProcessor {
  const wrapped: FileProcessor = { ...stage };
  if (stage.pre) {
    wrapped.pre = (file: PipelineFile, context: ProcessorContext) =>
      stage.pre!(file, { ...context, settings });
  }
  if (stage.transform) {
    wrapped.transform = (content, file, context) =>
      stage.transform!(content, file, { ...context, settings });
  }
  if (stage.post) {
    wrapped.post = (file: PipelineFile, context: ProcessorContext) =>
      stage.post!(file, { ...context, settings });
  }
  if (stage.afterBundle) {
    wrapped.afterBundle = (content, context: BundleContext) =>
      stage.afterBundle!(content, { ...context, settings });
  }
  return defineProcessor(wrapped);
}
