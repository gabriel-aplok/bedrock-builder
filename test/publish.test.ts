import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { publish, PublishError } from "../src/commands/publish.js";
import { setupFixture } from "./helpers.js";

describe("publish", () => {
  it("dry-run prints the plan without touching disk", async () => {
    const fixture = await setupFixture();
    try {
      const report = await publish(fixture.config, { dryRun: true });
      expect(report.ok).toBe(true);
      expect(report.dryRun).toBe(true);
      expect(report.version).toBe(fixture.config.version);
    } finally {
      await fixture.cleanup();
    }
  });

  it("bumps patch, minor, major, and exact", async () => {
    const fixture = await setupFixture();
    try {
      const patch = await publish(fixture.config, { dryRun: true, bump: "patch" });
      expect(patch.version).toBe("1.0.1");
      const minor = await publish(fixture.config, { dryRun: true, bump: "minor" });
      expect(minor.version).toBe("1.1.0");
      const major = await publish(fixture.config, { dryRun: true, bump: "major" });
      expect(major.version).toBe("2.0.0");
      const exact = await publish(fixture.config, { dryRun: true, bump: "3.2.1" });
      expect(exact.version).toBe("3.2.1");
    } finally {
      await fixture.cleanup();
    }
  });

  it("rejects a bad bump", async () => {
    const fixture = await setupFixture();
    try {
      await expect(publish(fixture.config, { dryRun: false, bump: "nope" })).rejects.toBeInstanceOf(
        PublishError,
      );
    } finally {
      await fixture.cleanup();
    }
  });

  it("ships and harnesses for real", async () => {
    const fixture = await setupFixture();
    try {
      const report = await publish(fixture.config, {});
      expect(report.ok).toBe(true);
      expect(report.bytes).toBeGreaterThan(0);
      expect(report.harnessFiles).toBeGreaterThan(0);
      expect(report.tagged).toBe(false);
      expect(report.pushed).toBe(false);
    } finally {
      await fixture.cleanup();
    }
  }, 30000);
});
