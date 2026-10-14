# Changelog

## Unreleased

## 0.3.0

- heal downloaded schemas: drop the relative `$id` that broke sibling `$ref` resolution, so json validation works in VSCodium.
- activate the extension on json and jsonc files, so schemas, coloring, and linting load on open.
- ship the esbuild build binaries for Windows and Linux in one vsix, so build, run, and watch work on both.
- warn on recipe item values with no pack definition, silent for vanilla ids.
- outline recipe ingredients plus result in breadcrumbs.
- complete table paths from BP loot files inside table values.
- offer to create missing loot table files from their warnings.
- hover recipe item values for their definition file or a missing note.
- jump from loot entry names to their table files.
- outline loot table pools and entries in breadcrumbs.
- warn on behavior entities missing a spawn event, with a quick fix to add it.
- add titleraw fade, scoreboard setup, and structure load mcfunction snippets.
- warn on missing loot and trade table paths, silent for dynamic paths.
- jump from recipe item values to their item definitions.
- hover loot and trade table paths for pool and entry counts.
- add animation controller, spawn rules, and dialogue scene snippets.
- jump from duplicate warnings straight to the other definition file.
- jump from loot and trade table paths to their files.
- ship mcfunction and json snippets: command chains, entity shells, recipe, loot table.
- warn on duplicate identifiers across pack files on save.
- read pack json tolerantly: comments and trailing commas work in harness, report, validation, and the ide.
- jump from event triggers and component groups to their definition blocks.
- outline entity, controller, and animation symbols in json files for breadcrumbs.
- fix bedrock command problems from the lightbulb: replace bad values, drop surplus args, create missing function files.
- jump from entity and item ids in mcfunction commands to their pack files.
- hover molang `query.` and `math.` names for reference descriptions in json files.
- jump from molang variable usages to pack assignment sites, `v.` and `variable.` unified.
- find every usage of an identifier across packs with find references.
- show bedrock command signatures while typing in mcfunction files.
- complete molang `query.`/`math.` reference and project variables in json strings.
- diagnose bedrock commands in mcfunction files: unknown commands and values error, unverifiable custom ids warn.
- go to function files from `function` paths in mcfunction files.
- hover bedrock command and argument descriptions in mcfunction files.
- complete bedrock commands, arguments, selectors, and project values in mcfunction files.
- add `Bedrock: Pack report` backed by core `report`.
- complete project identifiers, component keys, and geometry names in json files.
- add diff, manifest, version, publish, import, and init palette commands with picker inputs.
- scope schema globs to the configured pack dirs so custom layouts get json completion.
- wire schemas through user settings instead of project files, cleaning up old folder rows.
- deploy watch into the selected world instead of always the dev packs.
- show a message instead of an empty pick when no worlds are installed.
- pick the run world with `Bedrock: Select run world` instead of editing settings.
- pick the server folder with `Bedrock: Select server folder` instead of editing settings.

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
