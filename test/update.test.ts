import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { update, UpdateError } from "../src/commands/update.js";
import { setupFixture } from "./helpers.js";

describe("update", () => {
  let fx: Awaited<ReturnType<typeof setupFixture>> | null = null;

  afterEach(async () => {
    await fx?.cleanup().catch(() => undefined);
    fx = null;
  });

  it("throws when the project has no package.json", async () => {
    fx = await setupFixture();
    await expect(update(fx.config, { dryRun: true })).rejects.toBeInstanceOf(UpdateError);
  });

  it("dry run changes nothing and reports the command", async () => {
    fx = await setupFixture();
    const pkg = {
      name: "test-addon",
      version: "1.0.0",
      dependencies: { "@minecraft/server": "^2.0.0" },
      devDependencies: { "@aplok/bedrock-builder": "^0.1.0" },
    };
    const pkgPath = join(fx.config.__configDir, "package.json");
    await writeFile(pkgPath, JSON.stringify(pkg));
    const before = await readFile(pkgPath, "utf8");

    const report = await update(fx.config, { dryRun: true, json: true });
    expect(report.command).toBe("update");
    expect(report.ok).toBe(true);
    expect(report.dryRun).toBe(true);
    expect(report.installed).toBe(false);
    expect(await readFile(pkgPath, "utf8")).toBe(before);
  });
});
