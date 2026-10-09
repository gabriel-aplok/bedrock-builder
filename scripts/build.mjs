// build with esbuild directly, no tsup wrapper.
import { rm } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { build, context } = require("esbuild");

const prod = process.env.BB_PROD === "1";
const watch = process.argv.includes("--watch");
const minify = process.argv.includes("--minify") || prod;

const shared = {
  bundle: true,
  format: "esm",
  platform: "node",
  target: "es2022",
  sourcemap: !prod,
  minify,
  treeShaking: true,
  packages: "external",
};

await rm("dist", { recursive: true, force: true });

const targets = [
  {
    ...shared,
    entryPoints: ["src/cli.ts"],
    outfile: "dist/cli.js",
    banner: { js: "#!/usr/bin/env node" },
  },
  {
    ...shared,
    entryPoints: ["src/index.ts"],
    outfile: "dist/index.js",
  },
];

if (watch) {
  const contexts = await Promise.all(targets.map((options) => context(options)));
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  console.log("watching src/");
} else {
  await Promise.all(targets.map((options) => build(options)));
  console.log("built dist/cli.js plus dist/index.js");
}
