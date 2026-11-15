import { describe, expect, it } from "vitest";

import { shellLine } from "../src/process.js";

describe("shellLine", () => {
  it("joins simple tokens without quotes", () => {
    expect(shellLine("npm", ["install", "--no-audit"])).toBe("npm install --no-audit");
  });

  it("quotes tokens containing spaces", () => {
    expect(shellLine("C:\\Program Files\\app.exe", ["k=v"])).toBe(
      '"C:\\Program Files\\app.exe" k=v',
    );
    expect(shellLine("git", ["commit", "-m", "two words"])).toBe('git commit -m "two words"');
  });

  it("leaves tokens without spaces alone", () => {
    expect(shellLine("git", ["tag", "v0.2.0"])).toBe("git tag v0.2.0");
  });
});
