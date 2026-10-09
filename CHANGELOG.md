# Changelog

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
