import { stat } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { build } from "../src/commands/build.js";
import { clean } from "../src/commands/clean.js";
import { setupFixture } from "./helpers.js";

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

describe("clean command", () => {
  let fixture: Awaited<ReturnType<typeof setupFixture>>;

  beforeEach(async () => {
    fixture = await setupFixture();
  });
  afterEach(async () => {
    await fixture.cleanup();
  });

  it("removes dist on demand", async () => {
    await build(fixture.config, {});
    expect(await exists(fixture.config.out)).toBe(true);
    const report = await clean(fixture.config, {});
    expect(report.ok).toBe(true);
    expect(await exists(fixture.config.out)).toBe(false);
  });
});
