import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { version, VersionError } from "../src/commands/version.js";

const dirs: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "bb-version-"));
  dirs.push(dir);
  return dir;
}

async function seedProject(root: string): Promise<void> {
  await mkdir(join(root, "packs", "BP"), { recursive: true });
  await mkdir(join(root, "packs", "RP"), { recursive: true });
  await writeFile(
    join(root, "config.json"),
    JSON.stringify({
      type: "minecraftBedrock",
      name: "demo",
      packs: { behaviorPack: "packs/BP", resourcePack: "packs/RP" },
      bb: { version: "1.0.0" },
    }),
  );
  const manifest = (uuid: string) => ({
    format_version: 2,
    header: { name: "x", uuid, version: [1, 0, 0] },
    modules: [{ type: "data", uuid: "22222222-2222-2222-2222-222222222222" }],
  });
  await writeFile(
    join(root, "packs", "BP", "manifest.json"),
    JSON.stringify(manifest("11111111-1111-1111-1111-111111111111")),
  );
  await writeFile(
    join(root, "packs", "RP", "manifest.json"),
    JSON.stringify(manifest("33333333-3333-3333-3333-333333333333")),
  );
}

describe("version", () => {
  afterEach(async () => {
    for (const dir of dirs.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("bumps config plus both manifests", async () => {
    const root = await tempDir();
    await seedProject(root);
    const report = await version("2.3.4", { dir: root });

    expect(report.ok).toBe(true);
    const config = JSON.parse(await readFile(join(root, "config.json"), "utf8"));
    expect(config.bb.version).toBe("2.3.4");
    const bp = JSON.parse(await readFile(join(root, "packs", "BP", "manifest.json"), "utf8"));
    expect(bp.header.version).toEqual([2, 3, 4]);
    expect(bp.modules[0].version).toEqual([2, 3, 4]);
    const rp = JSON.parse(await readFile(join(root, "packs", "RP", "manifest.json"), "utf8"));
    expect(rp.header.version).toEqual([2, 3, 4]);
  });

  it("keeps uuids untouched", async () => {
    const root = await tempDir();
    await seedProject(root);
    await version("2.0.0", { dir: root });
    const bp = JSON.parse(await readFile(join(root, "packs", "BP", "manifest.json"), "utf8"));
    expect(bp.header.uuid).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("dry-run writes nothing", async () => {
    const root = await tempDir();
    await seedProject(root);
    const before = await readFile(join(root, "config.json"), "utf8");
    const report = await version("9.9.9", { dir: root, dryRun: true });
    expect(report.dryRun).toBe(true);
    expect(await readFile(join(root, "config.json"), "utf8")).toBe(before);
  });

  it("rejects bad semver", async () => {
    const root = await tempDir();
    await seedProject(root);
    await expect(version("1.2", { dir: root })).rejects.toBeInstanceOf(VersionError);
  });
});
