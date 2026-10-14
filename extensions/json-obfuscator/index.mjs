const MANIFEST_FILE = "manifest.json";
const DEFAULT_PROTECTED_KEYS = ["format_version"];
const HEX_BASE = 16;
const HEX_WIDTH = 4;
const PAD_CHAR = "0";
const PRETTY_INDENT = 2;

function spaces(count) {
  return " ".repeat(count);
}

function emitString(value, state) {
  if (value === "") return '""';
  state.changed = true;
  let out = '"';
  for (let i = 0; i < value.length; i++) {
    out += "\\u" + value.charCodeAt(i).toString(HEX_BASE).padStart(HEX_WIDTH, PAD_CHAR);
  }
  return out + '"';
}

function emit(value, protectedKeys, state, indent, level) {
  if (value === null || typeof value === "boolean") return String(value);
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return emitString(value, state);
  const open = Array.isArray(value) ? "[" : "{";
  const rows = Array.isArray(value)
    ? value.map((entry) => emit(entry, protectedKeys, state, indent, level + 1))
    : Object.entries(value).map(([key, entry]) => {
        if (protectedKeys.includes(key)) {
          return `${JSON.stringify(key)}: ${JSON.stringify(entry, null, indent || undefined)}`;
        }
        const name = emitString(key, state);
        const body = emit(entry, protectedKeys, state, indent, level + 1);
        return indent === 0 ? `${name}:${body}` : `${name}: ${body}`;
      });
  if (rows.length === 0) return Array.isArray(value) ? "[]" : "{}";
  if (indent === 0) return `${open}${rows.join(",")}${Array.isArray(value) ? "]" : "}"}`;
  const pad = spaces(indent * level);
  const inner = spaces(indent * (level + 1));
  const close = Array.isArray(value) ? "]" : "}";
  return `${open}\n${rows.map((row) => inner + row).join(",\n")}\n${pad}${close}`;
}

// tiny glob: * skips slashes, ** spans them, ? matches one char.
function globToRegExp(glob) {
  let out = "^";
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    if (char === "*") {
      if (glob[i + 1] === "*") {
        out += ".*";
        i++;
      } else {
        out += "[^/]*";
      }
    } else if (char === "?") {
      out += "[^/]";
    } else {
      out += char.replace(/[.+^${}()|[\]\\]/, "\\$&");
    }
  }
  return new RegExp(out + "$");
}

function toStringList(value, fallback) {
  if (value === undefined) return fallback;
  if (!Array.isArray(value)) return fallback;
  return value.filter((entry) => typeof entry === "string");
}

function enabledFor(rel, include, exclude) {
  const path = rel.toLowerCase().replace(/\\/g, "/");
  if (path.split("/").pop() === MANIFEST_FILE) return false;
  if (exclude.some((pattern) => globToRegExp(pattern.toLowerCase()).test(path))) return false;
  if (include.length === 0) return true;
  return include.some((pattern) => globToRegExp(pattern.toLowerCase()).test(path));
}

function obfuscateJson(content, rel, settings = {}) {
  if (!enabledFor(rel, toStringList(settings.include, []), toStringList(settings.exclude, []))) {
    return null;
  }
  const text = new TextDecoder().decode(content);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const state = { changed: false };
  const indent = settings.minify === true ? 0 : PRETTY_INDENT;
  const next = emit(
    parsed,
    toStringList(settings.protectedKeys, DEFAULT_PROTECTED_KEYS),
    state,
    indent,
    0,
  );
  if (!state.changed) return null;
  return next === text ? null : new TextEncoder().encode(next);
}

export default function jsonObfuscator({ settings }) {
  const config =
    typeof settings === "object" && settings !== null && !Array.isArray(settings) ? settings : {};
  return {
    name: "json-obfuscator",
    match: (file) => file.rel.toLowerCase().endsWith(".json"),
    transform: (content, file) => obfuscateJson(content, file.rel, config),
  };
}
