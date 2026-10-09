import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { build } from "../src/commands/build.js";
import { setupFixture } from "./helpers.js";

// dist layout: packs/BP/scripts/main.js plus the mirrored pack files.
function distPath(root: string, ...parts: string[]): string {
  return join(root, "dist", ...parts);
}

async function exists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

describe("build command", () => {
  let fixture: Awaited<ReturnType<typeof setupFixture>>;

  beforeEach(async () => {
    fixture = await setupFixture();
  });
  afterEach(async () => {
    await fixture.cleanup();
  });

  it("produces a complete dist/ tree (bundle + copied pack files)", async () => {
    await build(fixture.config, { release: false, clean: false });

    expect(await exists(distPath(fixture.root, "packs", "BP", "scripts", "main.js"))).toBe(true);
    expect(await exists(distPath(fixture.root, "packs", "BP", "items", "example.item.json"))).toBe(
      true,
    );
    expect(await exists(distPath(fixture.root, "packs", "RP", "textures", "example.png"))).toBe(
      true,
    );
  });

  it("--clean removes prior dist contents before rebuild", async () => {
    // a stale file that must not survive a clean build.
    const stalePath = distPath(fixture.root, "stale.txt");
    await mkdir(join(fixture.root, "dist"), { recursive: true });
    await writeFile(stalePath, "stale");

    await build(fixture.config, { release: false, clean: true });

    expect(await exists(stalePath)).toBe(false);
    // the real outputs still land.
    expect(await exists(distPath(fixture.root, "packs", "BP", "scripts", "main.js"))).toBe(true);
  });
});
