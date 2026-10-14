import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { parseArgs } from "../src/cli/parse.js";
import {
  BrarchiveError,
  brarchive,
  resolveOutput,
  resolveServerDir,
} from "../src/commands/brarchive.js";
import { setupFixture } from "./helpers.js";
import type { Fixture } from "./helpers.js";

describe("brarchive command", () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await setupFixture();
  });
  afterEach(async () => {
    await fixture.cleanup();
  });

  it("rejects non-windows platforms before touching the server", async () => {
    if (process.platform === "win32") return;
    await expect(brarchive(fixture.config, {})).rejects.toBeInstanceOf(BrarchiveError);
  });

  it("reports a missing server binary with the fix", async () => {
    const empty = await mkdtemp(join(tmpdir(), "bb-brarchive-test-"));
    try {
      await expect(resolveServerDir(fixture.config, empty)).rejects.toThrow(/bedrock_server/);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });

  it("finds the server through the flag", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bb-brarchive-test-"));
    await writeFile(join(dir, "bedrock_server.exe"), "fake");
    try {
      expect(await resolveServerDir(fixture.config, dir)).toBe(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("anchors a relative flag to the config dir", async () => {
    const dir = join(fixture.root, "srv");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "bedrock_server.exe"), "fake");
    expect(await resolveServerDir(fixture.config, "srv")).toBe(dir);
  });

  it("finds the server through bb.serverDir in config.json", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bb-brarchive-test-"));
    await writeFile(join(dir, "bedrock_server.exe"), "fake");
    const configPath = join(fixture.root, "config.json");
    await writeFile(
      configPath,
      `${JSON.stringify({ name: "t", version: "1.0.0", bb: { serverDir: dir } }, null, 2)}\n`,
      "utf8",
    );
    try {
      const config = await loadConfig(configPath);
      expect(await resolveServerDir(config, undefined)).toBe(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("parses brarchive flags", async () => {
    const got = parseArgs([
      "brarchive",
      "--output",
      "./out.mcaddon",
      "--server-dir",
      "./srv",
      "--keep-config",
      "--json",
    ]);
    expect(got.command).toBe("brarchive");
    expect(got.output).toBe("./out.mcaddon");
    expect(got.serverDir).toBe("./srv");
    expect(got.keepConfig).toBe(true);
    expect(got.unknown).toEqual([]);
  });

  it("swaps a mismatched output extension instead of appending", async () => {
    const both = [
      { kind: "BP", path: "/tmp/bp", prefix: "BP" },
      { kind: "RP", path: "/tmp/rp", prefix: "RP" },
    ] as const;
    const single = [{ kind: "RP", path: "/tmp/rp", prefix: "RP" }] as const;
    expect(resolveOutput(fixture.config, "./out.mcpack", [...both])).toBe(
      join(fixture.root, "out.mcaddon"),
    );
    expect(resolveOutput(fixture.config, "./out.mcaddon", [...single])).toBe(
      join(fixture.root, "out.mcpack"),
    );
    expect(resolveOutput(fixture.config, "./out", [...both])).toBe(
      join(fixture.root, "out.mcaddon"),
    );
  });
});
