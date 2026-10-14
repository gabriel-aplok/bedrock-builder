import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { init, InitError } from "../src/commands/init.js";

const dirs: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "bb-init-"));
  dirs.push(dir);
  return dir;
}

describe("init", () => {
  afterEach(async () => {
    for (const dir of dirs.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("scaffolds config, packs, manifests, and entry", async () => {
    const parent = await tempDir();
    const dir = join(parent, "demo-addon");
    const report = await init("demo-addon", { dir });

    expect(report.ok).toBe(true);
    expect(report.files).toContain("config.json");
    expect(report.files).toContain("packs/BP/manifest.json");
    expect(report.files).toContain("packs/RP/manifest.json");
    expect(report.files).toContain("src/main.ts");

    const config = JSON.parse(await readFile(join(dir, "config.json"), "utf8"));
    expect(config.name).toBe("demo-addon");
    expect(config.bb.entry).toBe("src/main.ts");
    expect(config.packs.behaviorPack).toBe("packs/BP");
  });

  it("writes fresh unique uuids into both manifests", async () => {
    const parent = await tempDir();
    const dir = join(parent, "demo-addon");
    await init("demo-addon", { dir });

    const bp = JSON.parse(await readFile(join(dir, "packs", "BP", "manifest.json"), "utf8"));
    const rp = JSON.parse(await readFile(join(dir, "packs", "RP", "manifest.json"), "utf8"));
    const uuids = [
      bp.header.uuid,
      ...bp.modules.map((m: { uuid: string }) => m.uuid),
      rp.header.uuid,
      ...rp.modules.map((m: { uuid: string }) => m.uuid),
    ];
    expect(new Set(uuids).size).toBe(uuids.length);
    for (const id of uuids) {
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it("writes a real png pack icon", async () => {
    const parent = await tempDir();
    const dir = join(parent, "demo-addon");
    await init("demo-addon", { dir });

    const icon = await readFile(join(dir, "packs", "BP", "pack_icon.png"));
    expect([...icon.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });

  it("refuses a non-empty target without force", async () => {
    const parent = await tempDir();
    const dir = join(parent, "demo-addon");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "keep.txt"), "x");

    await expect(init("demo-addon", { dir })).rejects.toBeInstanceOf(InitError);
  });

  it("overwrites a non-empty target with force", async () => {
    const parent = await tempDir();
    const dir = join(parent, "demo-addon");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "keep.txt"), "x");

    const report = await init("demo-addon", { dir, force: true });
    expect(report.ok).toBe(true);
  });

  it("rejects a bad name", async () => {
    const parent = await tempDir();
    await expect(init("Bad Name", { dir: join(parent, "x") })).rejects.toBeInstanceOf(InitError);
  });

  it("rejects a bad target version", async () => {
    const parent = await tempDir();
    await expect(
      init("demo-addon", { dir: join(parent, "x"), targetVersion: "1.21" }),
    ).rejects.toBeInstanceOf(InitError);
  });

  it("uses an explicit namespace instead of the derived one", async () => {
    const parent = await tempDir();
    const dir = join(parent, "demo-addon");
    await init("demo-addon", { dir, namespace: "guns" });

    const config = JSON.parse(await readFile(join(dir, "config.json"), "utf8"));
    expect(config.namespace).toBe("guns");
  });

  it("derives the namespace from the name by default", async () => {
    const parent = await tempDir();
    const dir = join(parent, "demo-addon");
    await init("demo-addon", { dir });

    const config = JSON.parse(await readFile(join(dir, "config.json"), "utf8"));
    expect(config.namespace).toBe("demo_addon");
  });

  it("rejects a bad namespace", async () => {
    const parent = await tempDir();
    await expect(
      init("demo-addon", { dir: join(parent, "x"), namespace: "Bad NS" }),
    ).rejects.toBeInstanceOf(InitError);
  });

  it("points the builder at a local package with --builder", async () => {
    const parent = await tempDir();
    const dir = join(parent, "demo-addon");
    await init("demo-addon", { dir, builder: "../local-builder.tgz", install: false });

    const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
    expect(pkg.devDependencies["@aplok/bedrock-builder"]).toBe(
      `file:${resolve(process.cwd(), "../local-builder.tgz")}`,
    );
  });
});
