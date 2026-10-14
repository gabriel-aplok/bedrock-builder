import { describe, expect, it } from "vitest";

import { parseJsonc, stripJsonc } from "../src/jsonc.js";

describe("jsonc", () => {
  it("parses plain json unchanged", () => {
    expect(parseJsonc('{"a": [1, 2], "b": "x"}')).toEqual({ a: [1, 2], b: "x" });
  });

  it("strips line comments", () => {
    expect(parseJsonc('{\n// a note\n"a": 1 // trailing\n}')).toEqual({ a: 1 });
  });

  it("strips block comments", () => {
    expect(parseJsonc('{"a": /* middle */ 1, /* tail */ "b": 2}')).toEqual({ a: 1, b: 2 });
  });

  it("drops trailing commas in objects and arrays", () => {
    expect(parseJsonc('{"a": 1, "b": [1, 2,],}')).toEqual({ a: 1, b: [1, 2] });
  });

  it("keeps comment-like text inside strings", () => {
    expect(parseJsonc('{"a": "http://x // y /* z */", "b": "a,}b"}')).toEqual({
      a: "http://x // y /* z */",
      b: "a,}b",
    });
  });

  it("handles escaped quotes before comments", () => {
    expect(parseJsonc('{"a": "say \\"hi\\" // not comment"} // real')).toEqual({
      a: 'say "hi" // not comment',
    });
  });

  it("still throws on broken json", () => {
    expect(() => parseJsonc("{nope")).toThrow();
    expect(() => parseJsonc('{"a": }')).toThrow();
  });

  it("strips an unterminated block comment to end of file", () => {
    expect(stripJsonc('{"a": 1} /* dangling')).toBe('{"a": 1} ');
  });
});
