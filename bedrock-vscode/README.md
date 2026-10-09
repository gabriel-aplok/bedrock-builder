# Bedrock Builder

Bedrock addon tools for VS Code. Build, deploy, and ship behavior and resource packs without leaving the editor. JSON files get validation and go to definition from official Mojang schemas, and scripts get hover and go to through the TypeScript server.

## Commands

- build, run, ship, check, clean. output goes to the Bedrock channel.
- new: type pick, name input, sidecar kind picks for item, block, entity.
- harness: runs the content link check, findings land in the Bedrock channel.
- scripts check: entry file, tsconfig, and `@minecraft/*` install state.
- watch start and stop: deploy watch with stop control, backed by `startDeployWatch`.
- schema select and refresh: versioned Mojang schemas.

## Language

- json go to: identifiers, geometry/controller/animation names, file refs.
- scripts: hover and go to come from the TS server once the entry, tsconfig, and server types resolve. the scripts check reports what is missing.

## Settings

- `bedrock.configPath`: config path relative to the workspace folder. empty means auto detect `config.json` then `bedrock.config.json`.
- `bedrock.schema.version`: `latest`, `beta`, or exact (for example `1.26.50`).
- `bedrock.schema.auto`: download and wire schemas on startup.
- `bedrock.script.check`: check script setup on startup.
- `bedrock.verbose`: builder logging.

## Build

```bash
cd bedrock-vscode
npm install
npm run build
npm run vsix
```

Install the vsix with `Extensions: Install from VSIX`, or run with F5 from `bedrock-vscode/`.
