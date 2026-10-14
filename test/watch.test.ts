import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { watch } from "../src/commands/watch.js";
import { setupFixture } from "./helpers.js";

async function untilTrue(
  check: () => Promise<boolean>,
  timeoutMs = 5000,
  gapMs = 50,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) return true;
    await new Promise((wake) => setTimeout(wake, gapMs));
  }
  return false;
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

describe("watch command (smoke)", () => {
  let fixture: Awaited<ReturnType<typeof setupFixture>>;
  let running: Promise<void> | null = null;

  beforeEach(async () => {
    fixture = await setupFixture();
    running = null;
  });
  afterEach(async () => {
    // SIGINT is the watch stop signal. wait for a clean settle.
    if (running) {
      process.emit("SIGINT");
      try {
        await Promise.race([running, new Promise<void>((wake) => setTimeout(wake, 5000))]);
      } catch {
        // shutdown noise is fine here.
      }
    }
    await fixture.cleanup();
  });

  it("initial build then mirrors a pack file change into dist/", async () => {
    running = watch(fixture.config, {});

    const mainJs = join(fixture.root, "dist", "packs", "BP", "scripts", "main.js");
    expect(await untilTrue(() => isFile(mainJs))).toBe(true);

    const srcItem = join(fixture.root, "packs", "BP", "items", "example.item.json");
    const distItem = join(fixture.root, "dist", "packs", "BP", "items", "example.item.json");
    expect(await untilTrue(() => isFile(distItem))).toBe(true);

    const original = await readFile(srcItem, "utf8");
    const updated = original.replace(/}\s*$/, ',"_watched":true}');

    // windows needs a beat between watcher attach and the first write,
    // or the event can slip past the initial scan.
    await new Promise((wake) => setTimeout(wake, 500));
    await writeFile(srcItem, updated);

    const mirrored = await untilTrue(async () => {
      try {
        return (await readFile(distItem, "utf8")).includes('"_watched":true');
      } catch {
        return false;
      }
    }, 8000);
    expect(mirrored).toBe(true);
  });
});
