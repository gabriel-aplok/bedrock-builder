import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { parseDiagnostics, typecheck } from "../src/typecheck.js";

// temp projects live inside the repo so typescript resolves up to node_modules.
const dirs: string[] = [];

async function project(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(process.cwd(), ".tc-"));
  dirs.push(root);
  for (const [name, body] of Object.entries(files)) {
    await writeFile(join(root, name), body);
  }
  return root;
}

const TSCONFIG = JSON.stringify({
  compilerOptions: {
    target: "ES2022",
    module: "ESNext",
    moduleResolution: "Bundler",
    strict: true,
    noEmit: true,
    skipLibCheck: true,
  },
  include: ["**/*.ts"],
});

describe("parseDiagnostics", () => {
  it("pulls file, line, column, code, and message from tsc output", () => {
    const out =
      "src/main.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'.\n" +
      "Found 1 error in the same file.\n";
    const found = parseDiagnostics(out);
    expect(found).toHaveLength(1);
    expect(found[0]).toEqual({
      file: "src/main.ts",
      line: 1,
      column: 7,
      code: "TS2322",
      message: "Type 'string' is not assignable to type 'number'.",
    });
  });

  it("returns nothing for clean output", () => {
    expect(parseDiagnostics("")).toEqual([]);
  });
});

describe("typecheck", () => {
  afterEach(async () => {
    for (const dir of dirs.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("skips when there is no tsconfig", async () => {
    const root = await project({ "main.ts": "export const a = 1;\n" });
    const result = await typecheck(root);
    expect(result.ran).toBe(false);
    expect(result.ok).toBe(true);
    expect(result.reason).toContain("tsconfig");
  });

  it("passes on clean typescript", async () => {
    const root = await project({
      "tsconfig.json": TSCONFIG,
      "main.ts": "const n: number = 1;\nexport { n };\n",
    });
    const result = await typecheck(root);
    expect(result.ran).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("returns structured diagnostics on a type error", async () => {
    const root = await project({
      "tsconfig.json": TSCONFIG,
      "main.ts": 'const n: number = "no";\nexport { n };\n',
    });
    const result = await typecheck(root);
    expect(result.ran).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics[0]?.code).toBe("TS2322");
    expect(result.diagnostics[0]?.line).toBe(1);
  });
});
