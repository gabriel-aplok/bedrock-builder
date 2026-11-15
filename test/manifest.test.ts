import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { detectPackLayout, rewriteManifest, rewriteManifests } from "../src/manifest/rewrite.js";
import { manifest, ManifestError } from "../src/commands/manifest.js";

const dirs: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "bb-manifest-"));
  dirs.push(dir);
  return dir;
}

const BP = {
  format_version: 2,
  header: {
    name: "old BP",
    description: "x",
    uuid: "11111111-1111-1111-1111-111111111111",
    version: [1, 0, 0],
  },
  modules: [{ type: "data", uuid: "22222222-2222-2222-2222-222222222222" }],
  dependencies: [{ uuid: "33333333-3333-3333-3333-333333333333" }],
};

const RP = {
  format_version: 2,
  header: {
    name: "old RP",
    description: "x",
    uuid: "33333333-3333-3333-3333-333333333333",
    version: [1, 0, 0],
  },
  modules: [{ type: "resources", uuid: "44444444-4444-4444-4444-444444444444" }],
  dependencies: [{ uuid: "11111111-1111-1111-1111-111111111111" }],
};

async function seedPacks(root: string): Promise<void> {
  await mkdir(join(root, "packs", "BP"), { recursive: true });
  await mkdir(join(root, "packs", "RP"), { recursive: true });
  await writeFile(join(root, "packs", "BP", "manifest.json"), JSON.stringify(BP));
  await writeFile(join(root, "packs", "RP", "manifest.json"), JSON.stringify(RP));
}

describe("manifest rewrite", () => {
  afterEach(async () => {
    for (const dir of dirs.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("detects the packs/BP plus packs/RP layout", async () => {
    const root = await tempDir();
    await seedPacks(root);
    const targets = await detectPackLayout(root);
    expect(targets.map((t) => t.kind).sort()).toEqual(["BP", "RP"]);
  });

  it("detects the flat BP plus RP layout", async () => {
    const root = await tempDir();
    await mkdir(join(root, "BP"), { recursive: true });
    await writeFile(join(root, "BP", "manifest.json"), JSON.stringify(BP));
    const targets = await detectPackLayout(root);
    expect(targets.map((t) => t.kind)).toEqual(["BP"]);
  });

  it("detects the microsoft behavior_packs layout", async () => {
    const root = await tempDir();
    await mkdir(join(root, "behavior_packs", "mine"), { recursive: true });
    await writeFile(join(root, "behavior_packs", "mine", "manifest.json"), JSON.stringify(BP));
    const targets = await detectPackLayout(root);
    expect(targets.map((t) => t.kind)).toEqual(["BP"]);
  });

  it("rewrites uuids and cross-links the packs", async () => {
    const root = await tempDir();
    await seedPacks(root);
    const report = await manifest({ dir: root, name: "fresh" });

    expect(report.ok).toBe(true);
    const bp = JSON.parse(await readFile(join(root, "packs", "BP", "manifest.json"), "utf8"));
    const rp = JSON.parse(await readFile(join(root, "packs", "RP", "manifest.json"), "utf8"));
    expect(bp.header.uuid).not.toBe(BP.header.uuid);
    expect(rp.header.uuid).not.toBe(RP.header.uuid);
    expect(bp.header.name).toBe("fresh BP");
    expect(rp.header.name).toBe("fresh RP");
    // rp dep points at the bp header.
    expect(rp.dependencies[0].uuid).toBe(bp.header.uuid);
    // bp dep points at the rp header.
    expect(bp.dependencies[0].uuid).toBe(rp.header.uuid);
  });

  it("bumps versions when asked", async () => {
    const root = await tempDir();
    await seedPacks(root);
    await manifest({ dir: root, name: "fresh", version: "2.3.4" });
    const bp = JSON.parse(await readFile(join(root, "packs", "BP", "manifest.json"), "utf8"));
    expect(bp.header.version).toEqual([2, 3, 4]);
    expect(bp.modules[0].version).toEqual([2, 3, 4]);
  });

  it("dry-run changes nothing", async () => {
    const root = await tempDir();
    await seedPacks(root);
    const before = await readFile(join(root, "packs", "BP", "manifest.json"), "utf8");
    const report = await manifest({ dir: root, dryRun: true });
    expect(report.dryRun).toBe(true);
    expect(await readFile(join(root, "packs", "BP", "manifest.json"), "utf8")).toBe(before);
  });

  it("rejects bad input without touching disk", () => {
    expect(() => rewriteManifest("nope", "BP", { name: "x" }, "a", "b")).toThrow();
  });

  it("reports full coverage on existing packs", async () => {
    const root = await tempDir();
    await seedPacks(root);
    const report = await rewriteManifests(await detectPackLayout(root), { name: "fresh" });
    expect(report.targets).toHaveLength(2);
    expect(report.changes.length).toBeGreaterThan(0);
  });

  it("throws when nothing is found", async () => {
    const root = await tempDir();
    await expect(manifest({ dir: root })).rejects.toBeInstanceOf(ManifestError);
  });
});
