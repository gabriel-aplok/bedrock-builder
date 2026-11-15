import { describe, expect, it } from "vitest";

describe("public media API", () => {
  it("does not expose media processors from the core package", async () => {
    const api = await import("../src/index.js");
    for (const name of [
      "audioOgg",
      "findFfmpeg",
      "resetFfmpegCache",
      "textureTga",
      "decodePng",
      "encodeTga",
    ]) {
      expect(name in api).toBe(false);
    }
  });
});
