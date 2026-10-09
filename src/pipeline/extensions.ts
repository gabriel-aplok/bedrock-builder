import type { BundleContext, FileProcessor } from "./types.js";

const custom: FileProcessor[] = [];

export function defineProcessor(stage: FileProcessor): FileProcessor {
  if (typeof stage?.name !== "string" || stage.name.trim() === "") {
    throw new Error("defineProcessor needs a non-empty `name`.");
  }
  if (typeof stage?.match !== "function") {
    throw new Error(`processor "${stage.name}" needs a \`match(file)\` function.`);
  }
  for (const hook of ["remap", "pre", "transform", "post", "afterBundle"] as const) {
    if (stage[hook] !== undefined && typeof stage[hook] !== "function") {
      throw new Error(`processor "${stage.name}" hook \`${hook}\` must be a function.`);
    }
  }
  return stage;
}

// same name replaces the old entry.
export function registerProcessor(stage: FileProcessor): void {
  const valid = defineProcessor(stage);
  const at = custom.findIndex((entry) => entry.name === valid.name);
  if (at >= 0) custom.splice(at, 1, valid);
  else custom.push(valid);
}

export function unregisterProcessor(name: string): boolean {
  const at = custom.findIndex((entry) => entry.name === name);
  if (at < 0) return false;
  custom.splice(at, 1);
  return true;
}

export function clearProcessors(): void {
  custom.length = 0;
}

export function customProcessors(): FileProcessor[] {
  return [...custom];
}

export async function runBundleHooks(
  content: Uint8Array,
  context: BundleContext,
): Promise<Uint8Array> {
  let current = content;
  for (const processor of custom) {
    if (!processor.afterBundle) continue;
    try {
      const next = await processor.afterBundle(current, context);
      if (next !== null) current = next;
    } catch (err) {
      throw new Error(
        `extension "${processor.name}" afterBundle failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return current;
}
