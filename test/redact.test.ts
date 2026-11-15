import { describe, expect, it } from "vitest";

import { redact } from "../src/redact.js";

describe("redact", () => {
  it("strips a password from a remote url", () => {
    expect(redact("https://user:s3cret@github.com/o/r.git")).toBe("https://***@github.com/o/r.git");
  });

  it("strips an x-access-token remote", () => {
    expect(redact("https://x-access-token:ghs_abc123@github.com/o/r")).toBe(
      "https://***@github.com/o/r",
    );
  });

  it("keeps a plain ssh user with no secret", () => {
    expect(redact("ssh://git@github.com:22/o/r.git")).toBe("ssh://git@github.com:22/o/r.git");
  });

  it("strips a long opaque userinfo token", () => {
    const token = "a".repeat(40);
    expect(redact(`https://${token}@host/o/r`)).toBe("https://***@host/o/r");
  });

  it("strips npm token config lines", () => {
    expect(redact("//registry.npmjs.org/:_authToken=npm_abc")).toContain("***");
  });

  it("strips github and npm token prefixes", () => {
    expect(redact("token ghp_abcdefghijklmnopqrst")).toBe("token ***");
    expect(redact("github_pat_11ABCDEFG0123456789_abcdefghij")).toBe("***");
  });

  it("keeps ordinary text intact", () => {
    const text = "Pushed 3 commits to main in 120ms";
    expect(redact(text)).toBe(text);
  });

  it("keeps a url with no credentials intact", () => {
    const text = "https://github.com/o/r.git";
    expect(redact(text)).toBe(text);
  });
});
