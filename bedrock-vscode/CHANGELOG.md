# Changelog

## 0.2.0

- add `Bedrock: Update dependencies` backed by core `update`;
- add `Bedrock: Compile brarchive pack` with a `bedrock.brarchive.serverDir` setting;
- deploy `Bedrock: Run in game` into the world from `bedrock.run.world`;
- run strict harness through the `bedrock.harness.strict` setting;
- check scripts through core `checkScriptImports` (runtime imports, manifest dependency, installed major);
- offer a spawn egg pick for entities in `Bedrock: New feature`;
- use the core `isRecord` helper instead of local copies;
- build with TypeScript 7 and `@types/node` 26;
- license as Zlib with `LICENSE` shipped in the vsix;
- drop the redundant `activationEvents`, commands activate on their own;
- add the `repository` field so `vsce` packages without warnings.

## 0.1.0 - first release

The first packaged release of the Bedrock Builder extension.

- build, run, ship, check, clean, harness, and watch commands;
- new feature picks for item, block, and entity sidecars;
- Mojang schema download with version select and refresh;
- JSON go to definition for identifiers, geometry, and file refs;
- script status backed by entry, tsconfig, and server type checks.
