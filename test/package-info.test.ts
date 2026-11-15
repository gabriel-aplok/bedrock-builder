import { describe, expect, it } from "vitest";

import { packageVersion } from "../src/package-info.js";

describe("packageVersion", () => {
  it("reads the builder version from package.json", async () => {
    const version = await packageVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
    expect(version).not.toBe("0.0.0");
  });
});
