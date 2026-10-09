import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { pack, PackError, validatePackManifests } from "../src/commands/pack.js";
import { setupFixture } from "./helpers.js";

// zip central-directory names sit in the bytes as plain UTF-8,
// so a buffer scan is enough to prove an entry exists.
async function zipLists(path: string, ...names: string[]): Promise<void> {
  const text = (await readFile(path)).toString("binary");
  for (const name of names) expect(text).toContain(name);
}

describe("pack command", () => {
  let fixture: Awaited<ReturnType<typeof setupFixture>>;

  beforeEach(async () => {
    fixture = await setupFixture();
  });
  afterEach(async () => {
    await fixture.cleanup();
  });

  it("produces a .mcaddon zip containing <name>_BP/ and <name>_RP/", async () => {
    await pack(fixture.config, {});

    const outputPath = join(fixture.root, "dist", "test-addon-1.0.0.mcaddon");
    const st = await stat(outputPath);
    expect(st.isFile()).toBe(true);
    expect(st.size).toBeGreaterThan(0);

    await zipLists(
      outputPath,
      "test-addon_BP/",
      "test-addon_RP/",
      "manifest.json",
      "scripts/main.js",
    );
  });

  it("respects --output override", async () => {
    const customOutput = join(fixture.root, "custom-name.mcaddon");
    await pack(fixture.config, { output: customOutput });

    const st = await stat(customOutput);
    expect(st.isFile()).toBe(true);
    expect(st.size).toBeGreaterThan(0);
  });

  it("accepts a store-only level for speed", async () => {
    const customOutput = join(fixture.root, "store.mcaddon");
    await pack(fixture.config, { output: customOutput, level: 0 });

    const st = await stat(customOutput);
    expect(st.isFile()).toBe(true);
    expect(st.size).toBeGreaterThan(0);
    await zipLists(customOutput, "test-addon_BP/", "test-addon_RP/");
  });

  it("fails on a manifest missing header fields", async () => {
    const path = join(fixture.root, "packs", "BP", "manifest.json");
    const parsed = JSON.parse(await readFile(path, "utf8"));
    delete parsed.header.uuid;
    await writeFile(path, JSON.stringify(parsed));
    await expect(pack(fixture.config, {})).rejects.toBeInstanceOf(PackError);
  });

  it("fails on duplicate uuids across packs", async () => {
    const bpPath = join(fixture.root, "packs", "BP", "manifest.json");
    const rpPath = join(fixture.root, "packs", "RP", "manifest.json");
    const bp = JSON.parse(await readFile(bpPath, "utf8"));
    const rp = JSON.parse(await readFile(rpPath, "utf8"));
    rp.header.uuid = bp.header.uuid;
    await writeFile(rpPath, JSON.stringify(rp));
    const findings = await validatePackManifests(
      join(fixture.root, "packs", "BP"),
      join(fixture.root, "packs", "RP"),
    );
    expect(findings.some((entry) => entry.message.includes("duplicate"))).toBe(true);
    await expect(pack(fixture.config, {})).rejects.toBeInstanceOf(PackError);
  });
});
