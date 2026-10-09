<div align="center">
  <img src="./docs/assets/icon-512.png" alt="Bedrock Builder logo" width="96" height="96">
  <h1>Bedrock Builder</h1>
  <p>Build tools for Minecraft Bedrock add-ons.</p>
  <p>
    <a href="https://www.npmjs.com/package/@aplok/bedrock-builder"><img src="https://img.shields.io/npm/v/@aplok/bedrock-builder?style=flat-square&logo=npm&logoColor=white&label=version&color=black" alt="npm version"></a>
    <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-20.19%2B-000000?style=flat-square&logo=node.js&logoColor=white" alt="Node.js 20.19 or later"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-zlib-000000?style=flat-square" alt="zlib license"></a>
    <a href="https://discord.com/invite/PppEgBdss4"><img src="https://img.shields.io/badge/Discord-join-5865F2?style=flat-square&logo=discord&logoColor=white" alt="Discord invite"></a>
  </p>
  <p>
    <a href="https://bedrock.trenbankai.dev/">Site</a>
    ·
    <a href="https://bedrock.trenbankai.dev/docs/">Docs</a>
    ·
    <a href="https://bedrock.trenbankai.dev/docs/getting-started/">Getting Started</a>
    ·
    <a href="https://bedrock.trenbankai.dev/docs/reference/cli/">CLI Reference</a>
  </p>
</div>

`bb` is a Node.js build tool for Bedrock projects. It bundles scripts with esbuild, copies both packs into `dist/`, deploys to a local game installation, and produces `.mcaddon` releases.

## What it does

- **Create** a Bedrock project with manifests, packs, TypeScript, and UUIDs.
- **Generate** common items, blocks, entities, recipes, loot, sounds, and more.
- **Build** scripts and pack files into a clean `dist/` directory with incremental builds.
- **Run** by deploying once or watching for changes.
- **Validate** configuration, manifests, references, icons, languages, and output.
- **Ship** a release build and `.mcaddon` archive.
- **Extend** the pipeline without adding media codecs or project-specific behavior to core.

## Install

```bash
npm install --save-dev @aplok/bedrock-builder
```

The package provides both `bb` and `bedrock-builder` binaries. They are aliases for the same CLI.

## Start a project

```bash
bb init my-addon
cd my-addon
npm install
bb check
bb build
bb run --watch
```

For a release:

```bash
bb ship
```

## Project layout

```text
my-addon/
├─ bedrock.config.json
├─ package.json
├─ tsconfig.json
├─ src/
│  └─ main.ts
├─ packs/
│  ├─ BP/                 behavior pack
│  └─ RP/                 resource pack
└─ dist/                  generated output, normally gitignored
```

`config.json` is also supported. The generated project uses the standard project shape:

```json
{
  "type": "minecraftBedrock",
  "name": "my-addon",
  "authors": ["you"],
  "targetVersion": "1.21.0",
  "packs": {
    "behaviorPack": "packs/BP",
    "resourcePack": "packs/RP"
  },
  "bb": {
    "version": "1.0.0",
    "entry": "src/main.ts",
    "out": "dist",
    "deploy": {
      "target": "retail"
    }
  }
}
```

The entry can be TypeScript or JavaScript. If omitted, `bb` probes `src/main.ts` and then `src/main.js`. `bb.version` takes precedence over the project package version.

## Daily commands

| Command                                | Purpose                                            |
| -------------------------------------- | -------------------------------------------------- |
| `bb init`                              | Create a project.                                  |
| `bb new --list`                        | List all generator types.                          |
| `bb new item ruby`                     | Generate a feature.                                |
| `bb build`                             | Create development output.                         |
| `bb build --release`                   | Create minified release output without sourcemaps. |
| `bb run`                               | Build and deploy once.                             |
| `bb run --watch`                       | Rebuild and deploy on changes.                     |
| `bb check`                             | Validate the project.                              |
| `bb harness --strict`                  | Validate references and treat warnings as errors.  |
| `bb ship`                              | Build and create a `.mcaddon`.                     |
| `bb clean`                             | Remove output and cache.                           |
| `bb diff`                              | Show changes since the previous build.             |
| `bb ext`                               | Inspect configured extensions.                     |
| `bb ext --install`                     | Install extension dependencies locally.            |
| `bb manifest`                          | Rewrite pack UUIDs and links.                      |
| `bb version 1.1.0`                     | Update the project version.                        |
| `bb publish --bump minor --tag --push` | Run the release workflow.                          |

Most build commands support `--json`. Add `--typecheck` to `build` or `ship` to run the project TypeScript check first.

## Generators

Use `bb new <type> [name]` to generate connected Bedrock files and registry entries. See the complete list with:

```bash
bb new --list
bb new item ruby
bb new weapon fire_sword --mode 3d
bb new block glow_block --light 12
bb new recipe ruby_sword --ingredients minecraft:stick,minecraft:diamond
```

Generators are safe to rerun: identical files are skipped, registries are merged, and conflicts stop unless `--force` is provided. Some generators can add related recipe, loot, and equipment files.

## Extensions

Extensions are enabled in your project configuration. The core exposes generic processor hooks; format-specific tools belong to the extension that uses them.

```json
{
  "bb": {
    "extensions": ["tga-converter"]
  }
}
```

The loader checks, in order, relative paths, project `node_modules`, `.builder/extensions`, the global extension directory, and repository samples. Missing or broken extensions warn and skip the build.

Each extension can have an `extension.json` for Builder metadata and a `package.json` for npm metadata and dependencies. Install dependencies into the extension itself:

```bash
bb ext --install
```

Bundled samples include `tga-converter`, `emissive-fixer`, and `json-cleaner`. They are examples and are not included in the npm package.

## Deployment

The default `retail` target discovers common Bedrock installations. Use a custom game directory when needed:

```json
{
  "bb": {
    "deploy": {
      "target": "custom",
      "customPath": "C:/path/to/com.mojang"
    }
  }
}
```

## API

The package also provides JavaScript and TypeScript APIs for builds, generators, validation, and extensions:

```typescript
import { build, loadConfig } from "@aplok/bedrock-builder";

const config = await loadConfig("./bedrock.config.json");
await build(config, { release: false });
```

Media codecs are not exported by core. Use the relevant extension instead.

## Requirements

- Node.js 20.19 or newer.
- Minecraft Bedrock for local deployment.

## Security notes

`bb` is a build tool, so it touches the filesystem, spawns a few local tools, and reads some environment variables. It makes no network requests itself. Details per capability:

- **Filesystem.** Reading packs and writing `dist/` is the core job (`src/copier.ts`, `src/files/io.ts`, `src/files/tree.ts`). `bb` never reads outside the project directory, the deploy target, and the configured extension directories.
- **Shell.** Only fixed local tools are spawned, always with argument arrays, never shell strings:
  - `npm view` / `npm install` during `bb init` (`src/commands/init.ts`);
  - `npm install --ignore-scripts` into the extension folder during `bb ext --install` (`src/pipeline/loader.ts`);
  - `git init`, `git tag`, `git push` during `bb init` / `bb publish` (`src/commands/init.ts`, `src/commands/publish.ts`);
  - the project's own `tsc` for `--typecheck` and type watching (`src/typecheck.ts`, `src/typewatch.ts`).
- **Environment variables.** Only non-secret configuration is read: `NO_COLOR` / `TERM` for color output (`src/colors.ts`), `CI` / `GITHUB_ACTIONS` to disable progress output (`src/commands/create.ts`, `src/commands/pack.ts`), `LOCALAPPDATA` and platform home variables to locate the game folder (`src/paths.ts`), and `BB_PROD` for the production build (`scripts/build.mjs`). No tokens or credentials are read.
- **Network.** The core package performs no network access. The one exception is `bb init`, which runs `npm view <dep> version` to suggest a current dependency range and falls back to a local default offline (`src/commands/init.ts`).
- **Install scripts.** `bb ext --install` runs `npm install --ignore-scripts --no-audit --no-fund` inside the extension directory, so extension dependencies cannot run install scripts. The core package itself has no install script.
- **Dependencies.** Runtime dependencies are `@clack/prompts` (interactive setup), `chokidar` (file watching), and `esbuild` (script bundling). Colors, zip writing, and the build script are implemented in-repo (`src/colors.ts`, `src/pack/zip.ts`, `scripts/build.mjs`) instead of extra packages, i want to avoid future issues, the fmaous guy that wants to make everything from scratch.

## Documentation

- [Website](https://bedrock.trenbankai.dev/)
- [Getting started](https://bedrock.trenbankai.dev/docs/getting-started/)
- [CLI reference](https://bedrock.trenbankai.dev/docs/reference/cli/)
- [Configuration](https://bedrock.trenbankai.dev/docs/reference/config/)
- [API reference](https://bedrock.trenbankai.dev/docs/reference/api/)

## License

zlib License. See [LICENSE](LICENSE).
