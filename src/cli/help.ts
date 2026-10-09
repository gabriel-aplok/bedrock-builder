export const HELP = `Usage:
  bb <command> [options]
  bedrock-builder <command> [options]

Build:
  build               Bundle scripts and copy packs to dist/
  watch               Rebuild on save, no deploy
  clean               Remove dist/ and the build cache
  diff                Show what changed since the last build

Ship:
  run                 Build, then copy into the game packs
                      --world <name> targets one world folder
  run --watch         Hot reload into the game on save
  ship                Release build plus .mcaddon zip
  brarchive           Server-optimized pack via bedrock_server
  publish             Ship, harness, optional bump, tag, push

Make:
  init <name> [namespace]  Create a fresh add-on project
  import [dir]          Adopt a pack folder into a bb project
  new <type> [name]   Create a feature: BP plus RP plus registries
                      types: weapon | tool | armor | item | entity | block | recipe | loot
  manifest            Rewrite pack manifest uuids and names
  version <semver>    Set the project version in config plus manifests
  update              Update deps plus the server manifest version
                      types: weapon | tool | armor | item | entity | block | recipe | loot | spawn | trade | dialogue | animation | equipment | feature | feature_rule | particle | fog | function | voxel_shape | biome | camera | item_catalog | sound | biomes_client | block_culling | dimension | ui
  folders             Pick canonical pack folders interactively
  completion [shell]  Print shell completions: bash | zsh | powershell

Inspect:
  ext                 List resolved extension path and status
                      --install installs per-extension node deps
  check               Verify config, packs, entry, scripts, deploy target
  harness             Build then cross-check every dist reference

Global options:
  -c, --config <path>   Config path (default: ./config.json, then ./bedrock.config.json)
  -v, --verbose         Verbose logging
  --json                One json object on stdout, for CI
  -h, --help            Show help
  --version             Show version

Examples:
  bb build
  bb run --watch
  bb new weapon fire_sword --mode 3d
  bb ship --output ./out.mcaddon
  bb check --json

Command flags:
  build  --release            Minified, no sourcemaps
         --clean              Remove dist/ before building
         --typecheck          Run tsc --noEmit first
         --stats              Print bundle size plus biggest files
         --json               Print the build report as json
  run    --watch              Rebuild and re-run on save
         --release            Release build before running
         --no-types           Skip tsc --watch
  ship   --output <path>      Output .mcaddon path
                              (default: dist/<name>-<version>.mcaddon)
         --level <0-9>         Zip level, 0 is store-only (default 6)
         --typecheck          Run tsc --noEmit first
         --json               Print the ship report as json
  brarchive --output <path>   Output pack path
                              (default: dist/<name>-<version>.mcaddon)
         --server-dir <path>  Folder with bedrock_server.exe
                              (default: config, env, ./bedrock_server)
         --keep-config        Keep pack_optimizer_config.json
         --typecheck          Run tsc --noEmit first
         --json               Print the brarchive report as json
  publish --bump <v>        Bump first: patch | minor | major | x.y.z
         --tag               Create git tag v<version>
         --push              Push plus tags
         --dry-run            Print the plan, run nothing
         --typecheck          Run tsc --noEmit first
         --json               Print the publish report as json
  clean  (no flags, --json prints the report)
  diff   (no flags, --json prints the report)
  check  --fix               Create missing dirs, manifests, entry
         --json               Print the check report as json
  harness --no-build          Skip the build, check the current dist
          --strict            Fail on missing icons, unused lang, bad textures
         --json               Print the harness report as json
  folders (no flags, interactive)
  init   --dir <path>         Target directory (default: ./<name>)
         --here               Create into the current directory
         --target-version <v>  Minecraft target version (default 1.21.0)
         --builder <path>    Local builder tgz or dir instead of npm
         --js                 Emit src/main.js instead of src/main.ts
         --git / --no-git    Run git init (default on when interactive)
         --install / --no-install  Run npm install (default off)
         --force              Overwrite a non-empty directory
         --json               Print the init report as json
  manifest --name <name>      Project name baked into header.name
         --pack-version <v>   Bump header and module versions to x.y.z
         --dir <path>         Project root (default: cwd)
         --dry-run            Print the plan, write nothing
         --json               Print the manifest report as json
  version (no flags, --dry-run previews, --json prints the report)
  new    --name <name>        Override for the positional name
         --icon <name>        Icon name (item-family) / texture key
         --mode <2d|3d|icon>  Render mode (weapon/entity: 2d|3d; armor: icon|3d)
         --variant <type>     Tool: pickaxe | axe | shovel | hoe
         --piece <type>       Armor: helmet | chestplate | leggings | boots
         --tier <tier>        Tool tier (default diamond)
         --geometry <id>      3D geometry id (user-imported model)
         --texture <path>     3D texture path / block texture key
         --sound <sound>      Block sound (default stone)
         --render-method <m>  Block render method: opaque | blend | alpha_test
         --light <0-15>       Block light emission
         --durability <n>     Item durability
         --damage <n>         Weapon/tool damage
         --protection <n>     Armor protection
         --enchant-value <n>  Enchantability value
         --repair-item <id>   Repair item identifier
         --display-name <s>   Display name override
         --recipe-kind <k>    Recipe: shapeless | shaped | furnace
         --pattern <rows>     Shaped rows, ";" separated
         --key <map>          Shaped symbols, "X=id" comma separated
         --result <id>        Recipe output or loot drop id
         --ingredients <ids>  Recipe inputs, comma separated
         --loot-kind <k>      Loot: entity | block | chest
         --rolls <n>          Loot pool rolls
         --count <n>          Recipe output count
         --min <n>            Loot drop min count
         --max <n>            Loot drop max count
         --recipe <kind>      Also write a recipe (item/block): shapeless | furnace
         --loot <kind>        Also write a loot table (entity/block): entity | block | chest
         --spawn-category <k> Spawn: animal | monster | ambient | water
         --weight <n>         Spawn weight
         --want <id>          Trade want id
         --give <id>          Trade give id
         --dialogue-text <s>  NPC line
         --dialogue-button <s> NPC button
         --animation <id>     Animation to play
         --equipment <kind>   Also write an equipment table (entity)
         --color <hex>        Fog or biome water color
         --fog <id>           Biome fog identifier
         --x <n>              Camera pos_x
         --y <n>              Camera pos_y
         --z <n>              Camera pos_z
         --category <c>       Item catalog category
         --group <id>         Item catalog group
         --command <text>     Function command line
         --sound-file <path>  Sound file path
         --direction <dir>    Culling direction
         --from <file>        Import the behavior body from a json file
         --spawn-egg          Write a spawn egg item (entity)
         --unlock <id>        Recipe unlock item id or context:name
         --max-uses <n>       Trade max uses
         --xp <n>             Trade xp reward
         --pools <n>          Loot table pool count (1-16)
         --force              Overwrite conflicting files
         --dry-run            Print the plan, write nothing
         --list               List all generator types
         -y, --yes            Accept defaults (non-interactive)
`;

export function showHelp(): void {
  process.stdout.write(HELP);
}
