import type { BedrockConfig } from "./config.js";
import { resolveProcessors, runPipeline, runPipelineFile } from "./pipeline/index.js";

export async function copyPackFiles(config: BedrockConfig): Promise<void> {
  await runPipeline(config, { release: false });
}

export async function copyPackFile(config: BedrockConfig, changed: string): Promise<void> {
  await runPipelineFile(config, changed, { release: false }, resolveProcessors(config));
}
