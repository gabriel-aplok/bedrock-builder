import { randomUUID } from "node:crypto";

import { deriveNamespace } from "../generate/core/identifier.js";

// 64x64 solid icon, valid png, kept inline so init needs no asset files.
const PACK_ICON =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAmElEQVR4nO3QMREAIBDAsPeDU/ThB2RkoEP2Xmftc382OkBrgA7QGqADtAboAK0BOkBrgA7QGqADtAboAK0BOkBrgA7QGqADtAboAK0BOkBrgA7QGqADtAboAK0BOkBrgA7QGqADtAboAK0BOkBrgA7QGqADtAboAK0BOkBrgA7QGqADtAboAK0BOkBrgA7QGqADtAboAO0BT1qCWf17B98AAAAASUVORK5CYII=";

export interface InitInput {
  name: string;
  targetVersion: string;
  minEngineVersion: string;
  version: string;
  serverRange: string;
  builderRange: string;
  // emit src/main.js and point entry at it, keeping ts support.
  js: boolean;
}

export interface InitFile {
  rel: string;
  body: string;
  base64?: boolean;
}

function parseVersion(text: string): [number, number, number] {
  const parts = text.split(".").map((p) => Number(p));
  return [parts[0] ?? 1, parts[1] ?? 0, parts[2] ?? 0];
}

function dump(obj: unknown): string {
  return `${JSON.stringify(obj, null, 2)}\n`;
}

export function buildInitFiles(input: InitInput): InitFile[] {
  const { name, targetVersion, minEngineVersion, version, serverRange, builderRange, js } = input;
  const bpHeader = randomUUID();
  const bpData = randomUUID();
  const bpScript = randomUUID();
  const rpHeader = randomUUID();
  const rpResources = randomUUID();
  const minEngine = parseVersion(minEngineVersion);
  const packVersion = parseVersion(version);

  const bpManifest = {
    format_version: 2,
    metadata: { product_type: "addon" },
    header: {
      description: `${name} behavior pack`,
      name: `${name} BP`,
      uuid: bpHeader,
      min_engine_version: minEngine,
      version: packVersion,
    },
    modules: [
      { type: "data", uuid: bpData, version: packVersion },
      {
        type: "script",
        language: "javascript",
        entry: "scripts/main.js",
        uuid: bpScript,
        version: packVersion,
      },
    ],
    dependencies: [{ module_name: "@minecraft/server", version: "2.0.0" }],
  };

  const rpManifest = {
    format_version: 2,
    metadata: { product_type: "addon" },
    header: {
      description: `${name} resource pack`,
      name: `${name} RP`,
      uuid: rpHeader,
      min_engine_version: minEngine,
      version: packVersion,
    },
    modules: [{ type: "resources", uuid: rpResources, version: packVersion }],
    dependencies: [{ uuid: bpHeader, version: packVersion }],
  };

  const config = {
    type: "minecraftBedrock",
    name,
    authors: [],
    targetVersion,
    namespace: deriveNamespace(name),
    packs: { behaviorPack: "packs/BP", resourcePack: "packs/RP" },
    worlds: [],
    bb: {
      version,
      entry: js ? "src/main.js" : "src/main.ts",
      out: "dist",
      deploy: { target: "retail", customPath: null },
    },
  };

  const pkg = {
    name,
    version,
    private: true,
    type: "module",
    scripts: {
      build: "bb build",
      watch: "bb watch",
      run: "bb run",
      "run:watch": "bb run --watch",
      ship: "bb ship",
      clean: "bb clean",
      check: "bb check",
      folders: "bb folders",
      typecheck: "tsc --noEmit",
    },
    dependencies: { "@minecraft/server": serverRange },
    devDependencies: {
      "@aplok/bedrock-builder": builderRange,
      typescript: "^5.6.0",
    },
  };

  const tsconfig = {
    compilerOptions: {
      target: "es2022",
      module: "esnext",
      moduleResolution: "bundler",
      lib: ["es2022"],
      strict: true,
      noUncheckedIndexedAccess: true,
      noImplicitOverride: true,
      exactOptionalPropertyTypes: true,
      verbatimModuleSyntax: true,
      isolatedModules: true,
      erasableSyntaxOnly: true,
      resolveJsonModule: true,
      moduleDetection: "force",
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      allowJs: true,
      checkJs: false,
      noEmit: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      rootDir: "src",
    },
    include: ["src/**/*"],
    exclude: ["node_modules", "dist"],
  };

  const main = `import { world } from "@minecraft/server";

world.afterEvents.playerSpawn.subscribe((event) => {
  if (event.initialSpawn) {
    event.player.sendMessage("Hello from ${name}!");
  }
});
`;

  const gitignore = `node_modules
dist
*.log
.DS_Store
`;

  const readme = `# ${name}

Minecraft Bedrock add-on.

\`\`\`bash
npm install
npm run build      # bundle into dist/
npm run run:watch  # rebuild and copy into the game on save
npm run ship       # release build plus .mcaddon
\`\`\`
`;

  const lang = `pack.name=${name}\npack.description=${name} add-on\n`;

  return [
    { rel: "config.json", body: dump(config) },
    { rel: "package.json", body: dump(pkg) },
    { rel: "tsconfig.json", body: dump(tsconfig) },
    { rel: ".gitignore", body: gitignore },
    { rel: "README.md", body: readme },
    { rel: js ? "src/main.js" : "src/main.ts", body: main },
    { rel: "packs/BP/manifest.json", body: dump(bpManifest) },
    { rel: "packs/BP/pack_icon.png", body: PACK_ICON, base64: true },
    { rel: "packs/RP/manifest.json", body: dump(rpManifest) },
    { rel: "packs/RP/pack_icon.png", body: PACK_ICON, base64: true },
    { rel: "packs/RP/texts/en_US.lang", body: lang },
    { rel: "packs/RP/texts/languages.json", body: dump(["en_US"]) },
    {
      rel: "packs/RP/textures/item_texture.json",
      body: dump({
        resource_pack_name: "vanilla",
        texture_name: "atlas.items",
        texture_data: {},
      }),
    },
    {
      rel: "packs/RP/textures/terrain_texture.json",
      body: dump({
        resource_pack_name: "vanilla",
        texture_name: "atlas.terrain",
        padding: 8,
        num_mip_levels: 0,
        texture_data: {},
      }),
    },
  ];
}
