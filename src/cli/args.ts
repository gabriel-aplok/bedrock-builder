import type { CreateType } from "../generate/core/types.js";

export const COMMANDS = [
  "init",
  "build",
  "watch",
  "run",
  "ship",
  "clean",
  "diff",
  "folders",
  "ext",
  "check",
  "new",
  "manifest",
  "version",
  "harness",
  "publish",
] as const;
export type Command = (typeof COMMANDS)[number];

export interface CliArgs {
  command: Command | null;
  configPath: string | undefined;
  verbose: boolean;
  help: boolean;
  version: boolean;
  release: boolean;
  clean: boolean;
  watch: boolean;
  json: boolean;
  typecheck: boolean;
  stats: boolean;
  noTypes: boolean;
  fix: boolean;
  noBuild: boolean;
  strict: boolean;
  list: boolean;
  bump: string | undefined;
  tag: boolean;
  push: boolean;
  output: string | undefined;
  level: string | undefined;
  // init <name>.
  initName: string | undefined;
  // version <semver>.
  genVersion: string | undefined;
  dir: string | undefined;
  here: boolean;
  targetVersion: string | undefined;
  js: boolean;
  git: boolean;
  gitSet: boolean;
  install: boolean;
  installSet: boolean;
  packVersion: string | undefined;
  type: string | undefined;
  genName: string | undefined;
  name: string | undefined;
  icon: string | undefined;
  geometry: string | undefined;
  texture: string | undefined;
  mode: string | undefined;
  piece: string | undefined;
  tier: string | undefined;
  variant: string | undefined;
  sound: string | undefined;
  renderMethod: string | undefined;
  light: string | undefined;
  durability: string | undefined;
  damage: string | undefined;
  protection: string | undefined;
  enchantValue: string | undefined;
  repairItem: string | undefined;
  displayName: string | undefined;
  recipeKind: string | undefined;
  pattern: string | undefined;
  recipeKey: string | undefined;
  result: string | undefined;
  ingredients: string | undefined;
  lootKind: string | undefined;
  rolls: string | undefined;
  count: string | undefined;
  min: string | undefined;
  max: string | undefined;
  recipe: string | undefined;
  loot: string | undefined;
  spawnCategory: string | undefined;
  weight: string | undefined;
  want: string | undefined;
  give: string | undefined;
  dialogueText: string | undefined;
  dialogueButton: string | undefined;
  animation: string | undefined;
  equipment: string | undefined;
  color: string | undefined;
  fog: string | undefined;
  x: string | undefined;
  y: string | undefined;
  z: string | undefined;
  category: string | undefined;
  group: string | undefined;
  commandLine: string | undefined;
  soundFile: string | undefined;
  direction: string | undefined;
  force: boolean;
  dryRun: boolean;
  yes: boolean;
  unknown: string[];
  extraPositionals: string[];
}

export interface CreateFlags {
  type: CreateType | undefined;
  name: string | undefined;
  icon: string | undefined;
  geometry: string | undefined;
  texture: string | undefined;
  mode: string | undefined;
  piece: string | undefined;
  tier: string | undefined;
  variant: string | undefined;
  sound: string | undefined;
  renderMethod: string | undefined;
  light: string | undefined;
  durability: string | undefined;
  damage: string | undefined;
  protection: string | undefined;
  enchantValue: string | undefined;
  repairItem: string | undefined;
  displayName: string | undefined;
  recipeKind: string | undefined;
  pattern: string | undefined;
  recipeKey: string | undefined;
  result: string | undefined;
  ingredients: string | undefined;
  lootKind: string | undefined;
  rolls: string | undefined;
  count: string | undefined;
  min: string | undefined;
  max: string | undefined;
  recipe: string | undefined;
  loot: string | undefined;
  spawnCategory: string | undefined;
  weight: string | undefined;
  want: string | undefined;
  give: string | undefined;
  dialogueText: string | undefined;
  dialogueButton: string | undefined;
  animation: string | undefined;
  equipment: string | undefined;
  color: string | undefined;
  fog: string | undefined;
  x: string | undefined;
  y: string | undefined;
  z: string | undefined;
  category: string | undefined;
  group: string | undefined;
  commandLine: string | undefined;
  soundFile: string | undefined;
  direction: string | undefined;
  force: boolean;
  dryRun: boolean;
  yes: boolean;
  list: boolean;
}

export function blankArgs(): CliArgs {
  return {
    command: null,
    configPath: undefined,
    verbose: false,
    help: false,
    version: false,
    release: false,
    clean: false,
    watch: false,
    json: false,
    typecheck: false,
    stats: false,
    noTypes: false,
    fix: false,
    noBuild: false,
    strict: false,
    bump: undefined,
    tag: false,
    push: false,
    output: undefined,
    level: undefined,
    initName: undefined,
    genVersion: undefined,
    dir: undefined,
    here: false,
    targetVersion: undefined,
    js: false,
    git: true,
    gitSet: false,
    install: true,
    installSet: false,
    packVersion: undefined,
    type: undefined,
    genName: undefined,
    name: undefined,
    icon: undefined,
    geometry: undefined,
    texture: undefined,
    mode: undefined,
    piece: undefined,
    tier: undefined,
    variant: undefined,
    sound: undefined,
    renderMethod: undefined,
    light: undefined,
    durability: undefined,
    damage: undefined,
    protection: undefined,
    enchantValue: undefined,
    repairItem: undefined,
    displayName: undefined,
    recipeKind: undefined,
    pattern: undefined,
    recipeKey: undefined,
    result: undefined,
    ingredients: undefined,
    lootKind: undefined,
    rolls: undefined,
    count: undefined,
    min: undefined,
    max: undefined,
    recipe: undefined,
    loot: undefined,
    spawnCategory: undefined,
    weight: undefined,
    want: undefined,
    give: undefined,
    dialogueText: undefined,
    dialogueButton: undefined,
    animation: undefined,
    equipment: undefined,
    color: undefined,
    fog: undefined,
    x: undefined,
    y: undefined,
    z: undefined,
    category: undefined,
    group: undefined,
    commandLine: undefined,
    soundFile: undefined,
    direction: undefined,
    force: false,
    dryRun: false,
    yes: false,
    list: false,
    unknown: [],
    extraPositionals: [],
  };
}

export function toCreateFlags(args: CliArgs): CreateFlags {
  return {
    type: args.type as CreateType | undefined,
    name: args.genName ?? args.name,
    icon: args.icon,
    geometry: args.geometry,
    texture: args.texture,
    mode: args.mode,
    piece: args.piece,
    tier: args.tier,
    variant: args.variant,
    sound: args.sound,
    renderMethod: args.renderMethod,
    light: args.light,
    durability: args.durability,
    damage: args.damage,
    protection: args.protection,
    enchantValue: args.enchantValue,
    repairItem: args.repairItem,
    displayName: args.displayName,
    recipeKind: args.recipeKind,
    pattern: args.pattern,
    recipeKey: args.recipeKey,
    result: args.result,
    ingredients: args.ingredients,
    lootKind: args.lootKind,
    rolls: args.rolls,
    count: args.count,
    min: args.min,
    max: args.max,
    recipe: args.recipe,
    loot: args.loot,
    spawnCategory: args.spawnCategory,
    weight: args.weight,
    want: args.want,
    give: args.give,
    dialogueText: args.dialogueText,
    dialogueButton: args.dialogueButton,
    animation: args.animation,
    equipment: args.equipment,
    color: args.color,
    fog: args.fog,
    x: args.x,
    y: args.y,
    z: args.z,
    category: args.category,
    group: args.group,
    commandLine: args.commandLine,
    soundFile: args.soundFile,
    direction: args.direction,
    force: args.force,
    dryRun: args.dryRun,
    yes: args.yes,
    list: args.list,
  };
}
