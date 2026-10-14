import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig, type BedrockConfig } from "../src/config.js";

const SELF_DIR = fileURLToPath(new URL(".", import.meta.url));
const FIXTURE_DIR = join(SELF_DIR, "fixtures", "basic-addon");

export interface Fixture {
  configPath: string;
  config: BedrockConfig;
  root: string;
  cleanup: () => Promise<void>;
}

// clone basic-addon into a fresh temp dir and load its config there.
// tests must only touch the clone. The source fixture stays pristine
// because builds write dist/ next to the config.
export async function setupFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "bedrock-builder-test-"));
  await cp(FIXTURE_DIR, root, { recursive: true });
  const configPath = join(root, "bedrock.config.json");
  const config = await loadConfig(configPath);
  return {
    configPath,
    config,
    root,
    cleanup: () => rm(root, { recursive: true, force: true }).then(() => undefined),
  };
}
