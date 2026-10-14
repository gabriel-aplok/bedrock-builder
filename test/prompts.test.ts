import { describe, expect, it } from "vitest";

import { confirm, isCancel, multiselect, select, text } from "../src/prompts.js";

// tests run without a tty, so every prompt resolves with defaults.
describe("prompts", () => {
  it("text resolves with the default value", async () => {
    await expect(text({ message: "name", defaultValue: "fallback" })).resolves.toBe("fallback");
    await expect(text({ message: "name" })).resolves.toBe("");
  });

  it("confirm resolves with the initial value", async () => {
    await expect(confirm({ message: "sure?", initialValue: false })).resolves.toBe(false);
    await expect(confirm({ message: "sure?" })).resolves.toBe(true);
  });

  it("select resolves with the initial or first option", async () => {
    const options = [
      { value: "a", label: "a" },
      { value: "b", label: "b" },
    ];
    await expect(select({ message: "pick", options, initialValue: "b" })).resolves.toBe("b");
    await expect(select({ message: "pick", options })).resolves.toBe("a");
  });

  it("multiselect resolves empty without hanging", async () => {
    await expect(
      multiselect({ message: "pick", options: [{ value: "a", label: "a" }] }),
    ).resolves.toEqual([]);
  });

  it("isCancel only matches the cancel symbol", () => {
    expect(isCancel("a")).toBe(false);
    expect(isCancel(null)).toBe(false);
  });
});
