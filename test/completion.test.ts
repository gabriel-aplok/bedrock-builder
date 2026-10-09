import { describe, expect, it } from "vitest";

import { CompletionError, completion, parseCompletionShell } from "../src/commands/completion.js";
import { COMMANDS } from "../src/cli/args.js";
import { CREATE_TYPES } from "../src/generate/core/types.js";

describe("completion", () => {
  it("defaults to bash and rejects unknown shells", () => {
    expect(parseCompletionShell(undefined)).toBe("bash");
    expect(parseCompletionShell("zsh")).toBe("zsh");
    expect(parseCompletionShell("powershell")).toBe("powershell");
    expect(() => parseCompletionShell("fish")).toThrow(CompletionError);
  });

  it("bash completes every command", () => {
    const script = completion("bash");
    for (const command of COMMANDS) {
      expect(script).toContain(command);
    }
    expect(script).toContain("complete -F _bb_complete bb bedrock-builder");
  });

  it("bash completes new types and flags", () => {
    const script = completion("bash");
    for (const type of CREATE_TYPES) {
      expect(script).toContain(type);
    }
    expect(script).toContain("--from");
    expect(script).toContain("--spawn-egg");
  });

  it("zsh and powershell scripts mention commands and flags", () => {
    const zsh = completion("zsh");
    expect(zsh).toContain("#compdef bb bedrock-builder");
    expect(zsh).toContain('"new"');
    const powershell = completion("powershell");
    expect(powershell).toContain("Register-ArgumentCompleter");
    expect(powershell).toContain("'ship'");
  });
});
