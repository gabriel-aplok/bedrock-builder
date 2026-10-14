import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ImportError, importProject } from "../src/commands/import.js";

const dirs: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "bb-import-"));
  dirs.push(dir);
  return dir;
}

function manifest(name: string, uuid: string): string {
  return JSON.stringify({
    format_version: 2,
    header: {
      name,
      description: `${name} pack`,
      uuid,
      version: [1, 0, 0],
      min_engine_version: [1, 21, 0],
    },
    modules: [{ type: "data", uuid: "22222222-2222-2222-2222-222222222222", version: [1, 0, 0] }],
  });
}

async function seedBridge(root: string): Promise<void> {
  await mkdir(join(root, "BP"), { recursive: true });
  await mkdir(join(root, "RP"), { recursive: true });
  await writeFile(
    join(root, "BP", "manifest.json"),
    manifest("bridge BP", "11111111-1111-1111-1111-111111111111"),
  );
  await writeFile(
    join(root, "RP", "manifest.json"),
    manifest("bridge RP", "33333333-3333-3333-3333-333333333333"),
  );
  await writeFile(
    join(root, "config.json"),
    JSON.stringify({
      type: "minecraftBedrock",
      name: "Bridge Project",
      namespace: "bridge_ns",
      targetVersion: "1.21.0",
      packs: { behaviorPack: "./BP", resourcePack: "./RP" },
    }),
  );
}

describe("import", () => {
  afterEach(async () => {
    for (const dir of dirs.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("adopts a bridge-style folder without touching packs", async () => {
    const root = await tempDir();
    await seedBridge(root);
    const report = await importProject(root, {});

    expect(report.ok).toBe(true);
    expect(report.files).toEqual(["package.json"]);
    const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    expect(pkg.name).toBe("bridge-project");
    expect(pkg.devDependencies["@aplok/bedrock-builder"]).toMatch(/^\^?\d+\.\d+\.\d+$/);
    // manifests keep their original uuids.
    const bp = JSON.parse(await readFile(join(root, "BP", "manifest.json"), "utf8"));
    expect(bp.header.uuid).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("writes config.json when none exists", async () => {
    const root = await tempDir();
    await mkdir(join(root, "packs", "BP"), { recursive: true });
    await mkdir(join(root, "packs", "RP"), { recursive: true });
    await writeFile(
      join(root, "packs", "BP", "manifest.json"),
      manifest("hand BP", "11111111-1111-1111-1111-111111111111"),
    );
    await writeFile(
      join(root, "packs", "RP", "manifest.json"),
      manifest("hand RP", "33333333-3333-3333-3333-333333333333"),
    );

    const report = await importProject(root, {});
    expect(report.files).toContain("config.json");
    const config = JSON.parse(await readFile(join(root, "config.json"), "utf8"));
    expect(config.packs).toEqual({ behaviorPack: "packs/BP", resourcePack: "packs/RP" });
    expect(config.namespace).toBe("hand_bp");
    expect(config.bb.out).toBe("dist");
  });

  it("dry run writes nothing", async () => {
    const root = await tempDir();
    await seedBridge(root);
    const report = await importProject(root, { dryRun: true, json: true });
    expect(report.dryRun).toBe(true);
    await expect(readFile(join(root, "package.json"), "utf8")).rejects.toThrow();
  });

  it("fails without both pack manifests", async () => {
    const root = await tempDir();
    await expect(importProject(root, {})).rejects.toBeInstanceOf(ImportError);
  });
});
