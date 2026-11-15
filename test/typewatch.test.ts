import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { watchTypes } from "../src/typewatch.js";

describe("watchTypes", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    for (const dir of dirs.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("stays silent without a tsconfig", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bb-nots-"));
    dirs.push(dir);
    await writeFile(join(dir, "main.ts"), "export const a = 1;\n");
    expect(watchTypes(dir)).toBeNull();
  });
});
