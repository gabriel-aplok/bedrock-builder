import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { build } from "../src/commands/build.js";
import { doctor } from "../src/commands/doctor.js";
import { pack } from "../src/commands/pack.js";
import { setupFixture } from "./helpers.js";

describe("json reports", () => {
  let fixture: Awaited<ReturnType<typeof setupFixture>>;

  beforeEach(async () => {
    fixture = await setupFixture();
  });
  afterEach(async () => {
    await fixture.cleanup();
    vi.restoreAllMocks();
  });

  it("build returns a report and prints one json line", async () => {
    const seen: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation(((line: string) => {
      seen.push(String(line));
      return true;
    }) as typeof process.stdout.write);
    const report = await build(fixture.config, { json: true });
    expect(report.ok).toBe(true);
    expect(report.command).toBe("build");
    const payload = seen.map((line) => line.trim()).find((line) => line.startsWith("{"));
    const parsed = JSON.parse(payload ?? "");
    expect(parsed.command).toBe("build");
    expect(parsed.ok).toBe(true);
  });

  it("ship returns a report with output and bytes", async () => {
    const report = await pack(fixture.config, { json: true });
    expect(report.ok).toBe(true);
    expect(report.bytes).toBeGreaterThan(0);
    expect(report.files).toBeGreaterThan(0);
  });

  it("check checks every row and passes on the fixture", async () => {
    const report = await doctor(fixture.config, { json: true });
    expect(report.command).toBe("check");
    expect(report.checks.map((entry) => entry.name)).toEqual([
      "config",
      "behavior-pack",
      "resource-pack",
      "bp-manifest",
      "rp-manifest",
      "entry",
      "scripts",
      "deploy",
    ]);
    expect(report.ok).toBe(true);
  });

  it("check reports one fix per failure", async () => {
    const bad = { ...fixture.config, entry: `${fixture.config.entry}.missing` };
    const report = await doctor(bad, {});
    const entry = report.checks.find((row) => row.name === "entry");
    expect(entry?.ok).toBe(false);
    expect(entry?.fix).toContain("bb.entry");
    expect(report.ok).toBe(false);
  });

  it("check --fix creates missing dirs, manifests, and entry", async () => {
    const root = await mkdtemp(join(tmpdir(), "bb-checkfix-"));
    try {
      const bad = {
        ...fixture.config,
        packs: {
          bp: join(root, "packs", "BP"),
          rp: join(root, "packs", "RP"),
        },
        entry: join(root, "src", "main.ts"),
      };
      const report = await doctor(bad, { fix: true });
      expect(report.fixed).toBe(5);
      expect(report.ok).toBe(true);
      const again = await doctor(bad, {});
      expect(again.ok).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
