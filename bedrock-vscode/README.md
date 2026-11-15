# Bedrock Builder

Bedrock addon tools for VS Code. Build, deploy, and ship behavior and resource packs without leaving the editor. JSON files get validation and go to definition from official Mojang schemas, and scripts get hover and go to through the TypeScript server.

## Commands

- build, run, ship, check, clean. output goes to the Bedrock channel.
- build, run, ship, harness, and watch need `@aplok/bedrock-builder` installed in the project
  so the project's own esbuild is used. the editor features never require it.
- run deploys into the world from `bedrock.run.world`, empty means the dev packs.
- select the world with `Bedrock: Select run world` instead of editing settings.
- brarchive: server-optimized pack, server dir from `bedrock.brarchive.serverDir`.
- select the server folder with `Bedrock: Select server folder`.
- report: read-only pack health in the Bedrock channel.
- update: refresh `@minecraft/server` and the builder, results land in the Bedrock channel.
- new: type pick, name input, sidecar kind picks for item, block, entity (spawn egg included).
- harness: runs the content link check, findings land in the Bedrock channel. strict follows `bedrock.harness.strict`.
- scripts check: runtime imports, BP manifest dependency, and installed server major.
- watch start and stop: deploy watch with stop control, backed by `startDeployWatch`.
  Watch deploys into the selected world when one is set.
- diff, manifest, version, publish, import, init: the remaining CLI flows with quick picks
  and inputs instead of flags.
- schema select and refresh: versioned Mojang schemas.
- completions: project identifiers, namespaced component keys, and geometry names
  from your own packs, rebuilt on save. refresh with `Bedrock: Refresh completions`.

## Language

- json go to: identifiers, recipe items, events, component groups, loot tables and entries, geometry names, file refs, molang variable assignments.
- json outline: entity, controller, animation, loot table, and recipe symbols for breadcrumbs.
- json references: every usage of an identifier across packs.
- json completion: project values plus molang `query.`/`math.` reference and your variables.
- json table completion: BP file paths inside table values.
- json molang hover: reference descriptions for `query.` and `math.` names.
- json table hover: pool and entry counts for loot and trade table paths.
- json item hover: definition file for recipe item values.
- json item diagnostics: warnings for missing pack definitions.
- json table diagnostics: warnings for missing table files, plus a quick fix to create them.
- json entity diagnostics: warning plus quick fix for a missing spawn event.
- mcfunction: command, argument, selector, and project value completion from Mojang forms, plus hover descriptions, go to function and value files, and live diagnostics.
- scripts: hover and go to come from the TS server once the entry, tsconfig, and server types resolve. the scripts check reports what is missing.

## Settings

- `bedrock.configPath`: config path relative to the workspace folder. empty means auto detect `config.json` then `bedrock.config.json`.
- `bedrock.schema.version`: `latest`, `beta`, or exact (for example `1.26.50`).
- `bedrock.schema.auto`: download and wire schemas on startup.
- `bedrock.script.check`: check script setup on startup.
- `bedrock.harness.strict`: strict harness, unused lang keys and missing icons fail.
- `bedrock.run.world`: deploy into a named world folder, empty means the dev packs.
- `bedrock.brarchive.serverDir`: folder with the server binary for brarchive.
- `bedrock.verbose`: builder logging.

## Build

```bash
cd bedrock-vscode
npm install
npm run build
npm run vsix
```

Install the vsix with `Extensions: Install from VSIX`, or run with F5 from `bedrock-vscode/`.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).
