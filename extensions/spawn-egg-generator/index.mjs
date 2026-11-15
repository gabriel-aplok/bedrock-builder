// emit minimal rp client entities with spawn egg colors for bp
// entities that have no client entity. source files are never
// changed. entities with is_spawnable or is_summonable false are
// skipped, and vanilla minecraft: ids are never emitted.
const ENTITY_FILE = ".entity.json";
const DEFAULT_BASE_COLOR = "#a0a0a0";
const DEFAULT_OVERLAY_COLOR = "#505050";
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const FORMAT_VERSION = "1.10.0";

function toColor(value, fallback) {
  return typeof value === "string" && COLOR_PATTERN.test(value) ? value : fallback;
}

function toBool(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function parseJson(content) {
  try {
    return JSON.parse(new TextDecoder().decode(content));
  } catch {
    return null;
  }
}

function bpIdentifier(doc) {
  if (typeof doc !== "object" || doc === null) return null;
  const entity = doc["minecraft:entity"];
  if (typeof entity !== "object" || entity === null) return null;
  const desc = entity.description;
  if (typeof desc !== "object" || desc === null) return null;
  if (typeof desc.identifier !== "string" || desc.identifier === "") return null;
  if (desc.identifier.startsWith("minecraft:")) return null;
  return desc.identifier;
}

function rpIdentifier(doc) {
  if (typeof doc !== "object" || doc === null) return null;
  const entity = doc["minecraft:client_entity"];
  if (typeof entity !== "object" || entity === null) return null;
  const desc = entity.description;
  if (typeof desc !== "object" || desc === null) return null;
  if (typeof desc.identifier !== "string" || desc.identifier === "") return null;
  return desc.identifier;
}

function spawnable(doc, onlySpawnable) {
  if (!onlySpawnable) return true;
  const desc = doc["minecraft:entity"].description;
  return desc.is_spawnable !== false && desc.is_summonable !== false;
}

function clientEntity(id, baseColor, overlayColor) {
  const text = `${JSON.stringify(
    {
      format_version: FORMAT_VERSION,
      "minecraft:client_entity": {
        description: {
          identifier: id,
          spawn_egg: { base_color: baseColor, overlay_color: overlayColor },
        },
      },
    },
    null,
    2,
  )}\n`;
  return new TextEncoder().encode(text);
}

function fileName(id) {
  const name = id.includes(":") ? id.slice(id.indexOf(":") + 1) : id;
  return `entity/${name}${ENTITY_FILE}`;
}

export default function spawnEggGenerator({ settings }) {
  const raw =
    typeof settings === "object" && settings !== null && !Array.isArray(settings) ? settings : {};
  const baseColor = toColor(raw.baseColor, DEFAULT_BASE_COLOR);
  const overlayColor = toColor(raw.overlayColor, DEFAULT_OVERLAY_COLOR);
  const onlySpawnable = toBool(raw.onlySpawnable, true);
  const wanted = new Set();
  const covered = new Set();
  return {
    name: "spawn-egg-generator",
    match: (file) => {
      if (typeof file.rel !== "string" || !file.rel.endsWith(".json")) return false;
      const rel = file.rel.replace(/\\/g, "/");
      if (file.kind === "BP") return rel.startsWith("entities/");
      if (file.kind === "RP") return rel.startsWith("entity/");
      return false;
    },
    transform: (content, file) => {
      const doc = parseJson(content);
      if (doc === null) return null;
      if (file.kind === "BP") {
        const id = bpIdentifier(doc);
        if (id !== null && spawnable(doc, onlySpawnable)) wanted.add(id);
      } else {
        const id = rpIdentifier(doc);
        if (id !== null) covered.add(id);
      }
      return null;
    },
    emit: () => {
      const out = [];
      for (const id of wanted) {
        if (covered.has(id)) continue;
        out.push({
          kind: "RP",
          rel: fileName(id),
          content: clientEntity(id, baseColor, overlayColor),
        });
      }
      return out;
    },
  };
}
