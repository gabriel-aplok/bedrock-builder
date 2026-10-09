export type CreateType =
  | "weapon"
  | "tool"
  | "armor"
  | "item"
  | "entity"
  | "block"
  | "recipe"
  | "loot"
  | "spawn"
  | "trade"
  | "dialogue"
  | "animation"
  | "equipment"
  | "feature"
  | "feature_rule"
  | "particle"
  | "fog"
  | "function"
  | "voxel_shape"
  | "biome"
  | "camera"
  | "item_catalog"
  | "sound"
  | "biomes_client"
  | "block_culling"
  | "dimension"
  | "ui";

export const CREATE_TYPES: readonly CreateType[] = [
  "weapon",
  "tool",
  "armor",
  "item",
  "entity",
  "block",
  "recipe",
  "loot",
  "spawn",
  "trade",
  "dialogue",
  "animation",
  "equipment",
  "feature",
  "feature_rule",
  "particle",
  "fog",
  "function",
  "voxel_shape",
  "biome",
  "camera",
  "item_catalog",
  "sound",
  "biomes_client",
  "block_culling",
  "dimension",
  "ui",
];

export interface CreateOptions {
  type?: CreateType | undefined;
  name?: string | undefined;
  icon?: string | undefined;
  displayName?: string | undefined;
  mode?: string | undefined;
  geometry?: string | undefined;
  texture?: string | undefined;
  variant?: string | undefined;
  tier?: string | undefined;
  repairItem?: string | undefined;
  piece?: string | undefined;
  protection?: number | undefined;
  durability?: number | undefined;
  damage?: number | undefined;
  enchantValue?: number | undefined;
  renderMethod?: string | undefined;
  sound?: string | undefined;
  light?: number | undefined;
  recipeKind?: string | undefined;
  pattern?: string | undefined;
  recipeKey?: string | undefined;
  result?: string | undefined;
  ingredients?: string | undefined;
  lootKind?: string | undefined;
  rolls?: number | undefined;
  count?: number | undefined;
  min?: number | undefined;
  max?: number | undefined;
  recipe?: string | undefined;
  loot?: string | undefined;
  spawnCategory?: string | undefined;
  weight?: number | undefined;
  want?: string | undefined;
  give?: string | undefined;
  dialogueText?: string | undefined;
  dialogueButton?: string | undefined;
  animation?: string | undefined;
  equipment?: string | undefined;
  color?: string | undefined;
  fog?: string | undefined;
  x?: number | undefined;
  y?: number | undefined;
  z?: number | undefined;
  category?: string | undefined;
  group?: string | undefined;
  commandLine?: string | undefined;
  soundFile?: string | undefined;
  direction?: string | undefined;
  force?: boolean | undefined;
  dryRun?: boolean | undefined;
  yes?: boolean | undefined;
  list?: boolean | undefined;
}

export interface PlannedFile {
  relPath: string;
  absPath: string;
  nextContent: string;
  status: "create" | "skip" | "conflict" | "overwrite" | "update";
}

export interface GeneratorResult {
  notes: string[];
}
