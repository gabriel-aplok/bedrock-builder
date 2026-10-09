import { defineConfig, type Options } from "tsup";

const shared: Options = {
  format: ["esm"],
  target: "es2022",
  outDir: "dist",
  sourcemap: process.env.BB_PROD !== "1",
  dts: false,
  splitting: false,
  treeshake: true,
  minify: false,
};

export default defineConfig([
  {
    ...shared,
    entry: { cli: "src/cli.ts" },
    clean: true,
    banner: { js: "#!/usr/bin/env node" },
  },
  {
    ...shared,
    entry: { index: "src/index.ts" },
    clean: false,
  },
]);
