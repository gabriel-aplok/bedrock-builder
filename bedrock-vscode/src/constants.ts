// shared names for the extension. no vscode imports here.
export const OUTPUT_NAME = "Bedrock";
export const STATUS_TEXT_PREFIX = "bedrock schemas";
export const SCRIPT_PREFIX = "bedrock scripts";

export const CONFIG_FILES = ["config.json", "bedrock.config.json"] as const;

export const SETTING_CONFIG_PATH = "bedrock.configPath";
export const SETTING_SCHEMA_VERSION = "bedrock.schema.version";
export const SETTING_SCHEMA_AUTO = "bedrock.schema.auto";
export const SETTING_VERBOSE = "bedrock.verbose";
export const SETTING_SCRIPT_CHECK = "bedrock.script.check";
export const SETTING_JSON_SCHEMAS = "json.schemas";

export const SCHEMA_VERSION_LATEST = "latest";
export const SCHEMA_VERSION_BETA = "beta";
export const SCHEMA_DEFAULT_VERSION = SCHEMA_VERSION_LATEST;
export const VERSION_EXACT = /^\d+\.\d+\.\d+(-beta\.\d+)?$/;
export const MANAGED_KEY = "bedrockManaged";

export const REGISTRY_URL = "https://registry.npmjs.org/@minecraft%2Fbedrock-schemas";
export const SCHEMA_PACKAGE = "@minecraft/bedrock-schemas";

export function tarballUrl(version: string): string {
  return `https://registry.npmjs.org/@minecraft/bedrock-schemas/-/bedrock-schemas-${version}.tgz`;
}

export const SCHEMA_STORE_DIR = "schemas";
export const PACKAGE_PREFIX = "package/";
export const SCHEMAS_PREFIX = "package/schemas/";
export const CATALOG_FILE = "package/catalog.json";

// identifier-ish values: namespace:name plus geometry and path refs.
export const IDENTIFIER_VALUE = "[A-Za-z0-9_.-]+:[A-Za-z0-9_./-]+";
export const GEOMETRY_NAME = "(?:geometry|controller|animation)\\.[\\w.]+";

export const FILE_REF_EXTS = [
  ".json",
  ".js",
  ".lang",
  ".mcfunction",
  ".png",
  ".tga",
  ".ogg",
  ".fsb",
] as const;

// caps keep indexing fast on big packs.
export const MAX_INDEX_FILES = 2000;
export const MAX_SCAN_BYTES = 524288;
export const MAX_HITS = 20;
export const VERSION_LIST_LIMIT = 20;
