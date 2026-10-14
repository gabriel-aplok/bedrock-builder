# Changelog

## Unreleased

- read pack json tolerantly: comments and trailing commas work in harness, report, validation, and the ide.
- add a `lang-gap-filler` sample extension that reports missing lang keys and can
  emit completed dist copies without touching sources.
- keep ghost paths reclaimed by regular pipeline outputs instead of deleting them.
- add a `spawn-egg-generator` sample extension that emits RP client entities with
  spawn eggs for BP entities missing them.
- harness loot checks: pool entries must name defined or vanilla items and entities,
  and loot table paths must resolve to files.
- add `bb report`, a read-only pack health scan with per-side counts, duplicate
  identifiers, invalid json, oversized files, and large textures.
- export `diff` and `publish` from the package index so the VS Code extension can call them.
- derive the builder version range from the package itself instead of stale constants.
- quote windows tool paths with spaces, fixing `bb brarchive` and installs under such paths.
- fix `bb diff` reporting remapped files as modified after a no-op build.
- mirror remapped file paths in watch mode instead of source paths.
- add an `emit` pipeline hook so extensions can generate sourceless files.
- add a `json-obfuscator` sample extension that escapes json strings as unicode.
- rewrite nested `description` identifiers into the project namespace on `bb new --from`.
- check the VS Code extension in CI with typecheck, build, and vsix packaging.
- document the VS Code extension under guides.
- import resource pack bodies with `bb new <type> --from <file>`, not just behavior pack ones.
- complete `--world` values from installed worlds in `bb completion` scripts.
- pick the run world and server folder from the VS Code command palette.

## 0.2.0

- remove `picocolors`, `tsup`, `archiver`, and `@clack/prompts` in favor of in-repo colors, prompts, zip writing, and an esbuild build script;
- fix a race where cache pruning could delete the bundler output directory;
- run `git` and `npm` through argument arrays instead of shell strings;
- run checks on Ubuntu and Windows;
- add `bb init <name> [namespace]` for an explicit identifier namespace;
- add `bb init --builder <path>` for a local builder tarball or directory.
- check atlas texture files and png sizes in `bb harness --strict`.
- check entry `@minecraft/*` imports and server version drift in `bb check`.
- check manifest UUIDs, engine version, and the RP to BP link on `bb ship`.
- accept manifest versions as `1.0.0` or `[1, 0, 0]` everywhere, and reject malformed strings.
- import behavior bodies from existing files with `bb new <type> --from <file>`.
- update declared deps, reinstall, and sync the manifest server version with `bb update`.
- print shell completions with `bb completion [bash|zsh|powershell]`.
- adopt existing pack folders with `bb import [dir]`.
- deploy into a named world with `bb run --world <name>`.
- compile server-optimized packs with `bb brarchive` (windows only).
- deploy to Preview and Store Beta installs with a `preview` target.
- add a `loot_table` generator plus `spawn-egg`, recipe `unlock`, and trade `max-uses`/`xp` options.

## 0.1.0 - first release

The first public release of Bedrock Builder.

- create Bedrock projects with `bb init`;
- generate common add-on resources with `bb new`;
- bundle scripts and copy behavior/resource packs with `bb build`;
- deploy locally with `bb run` and `bb run --watch`;
- validate projects with `bb check` and `bb harness`;
- package releases as `.mcaddon` files with `bb ship`;
- support extensions that you enable in your project;
- provide JSON output for automation and CI;
- provide a JavaScript and TypeScript API.
