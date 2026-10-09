import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { checkScriptImports } from "../src/script-check.js";

const dirs: string[] = [];

async function project(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "bb-scripts-"));
  dirs.push(dir);
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(dir, rel);
    await mkdir(join(abs, ".."), { recursive: true });
    await writeFile(abs, body);
  }
  return dir;
}

const manifest = (version: string | null): string =>
  JSON.stringify({
    format_version: 2,
    header: { name: "x", uuid: "y", version: [1, 0, 0] },
    modules: [],
    dependencies: version === null ? [] : [{ module_name: "@minecraft/server", version }],
  });

describe("checkScriptImports", () => {
  afterEach(async () => {
    for (const dir of dirs.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("passes when the entry has no runtime imports", async () => {
    const dir = await project({
      "src/main.ts": 'console.log("hi");\n',
      "packs/BP/manifest.json": manifest("1.10.0"),
    });
    const result = await checkScriptImports(
      join(dir, "src", "main.ts"),
      dir,
      join(dir, "packs", "BP", "manifest.json"),
    );
    expect(result).toEqual({ ok: true, detail: "no runtime imports", fix: null });
  });

  it("flags an unknown runtime module", async () => {
    const dir = await project({
      "src/main.ts": 'import { world } from "@minecraft/servre";\n',
      "packs/BP/manifest.json": manifest("1.10.0"),
    });
    const result = await checkScriptImports(
      join(dir, "src", "main.ts"),
      dir,
      join(dir, "packs", "BP", "manifest.json"),
    );
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("@minecraft/servre");
  });

  it("flags a missing manifest dependency", async () => {
    const dir = await project({
      "src/main.ts": 'import { world } from "@minecraft/server";\n',
      "packs/BP/manifest.json": manifest(null),
    });
    const result = await checkScriptImports(
      join(dir, "src", "main.ts"),
      dir,
      join(dir, "packs", "BP", "manifest.json"),
    );
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("no matching dependency");
  });

  it("flags major drift between manifest and installed versions", async () => {
    const dir = await project({
      "src/main.ts": 'import { world } from "@minecraft/server";\n',
      "packs/BP/manifest.json": manifest("1.10.0"),
      "node_modules/@minecraft/server/package.json": JSON.stringify({
        name: "@minecraft/server",
        version: "2.0.0",
      }),
    });
    const result = await checkScriptImports(
      join(dir, "src", "main.ts"),
      dir,
      join(dir, "packs", "BP", "manifest.json"),
    );
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("1.10.0");
    expect(result.detail).toContain("2.0.0");
  });

  it("passes when manifest and installed majors agree", async () => {
    const dir = await project({
      "src/main.ts": 'import { world } from "@minecraft/server";\n',
      "packs/BP/manifest.json": manifest("2.1.0"),
      "package.json": JSON.stringify({
        dependencies: { "@minecraft/server": "^2.0.0" },
      }),
    });
    const result = await checkScriptImports(
      join(dir, "src", "main.ts"),
      dir,
      join(dir, "packs", "BP", "manifest.json"),
    );
    expect(result).toEqual({
      ok: true,
      detail: "@minecraft/server 2.1.0",
      fix: null,
    });
  });

  it("skips cleanly when the entry is missing", async () => {
    const dir = await project({ "packs/BP/manifest.json": manifest("1.10.0") });
    const result = await checkScriptImports(
      join(dir, "src", "main.ts"),
      dir,
      join(dir, "packs", "BP", "manifest.json"),
    );
    expect(result.ok).toBe(true);
  });
});
