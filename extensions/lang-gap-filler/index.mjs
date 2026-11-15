// compare every .lang file against the default language. report
// mode emits one lang-gaps.json listing missing keys per file.
// fill mode also emits completed language files with the missing
// lines appended from the default text. source files are never
// changed, only dist copies are completed.
const LANG_EXT = ".lang";
const REPORT_FILE = "texts/__lang_gaps.json";
const DEFAULT_LANG = "en_US";
const FILLED_MARK = "# filled by lang-gap-filler";

function fileBase(rel) {
  const name = rel.replace(/\\/g, "/").split("/").pop() ?? "";
  return name.endsWith(LANG_EXT) ? name.slice(0, -LANG_EXT.length) : null;
}

function parseLang(text) {
  const keys = new Map();
  const lines = text.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const cut = trimmed.indexOf("=");
    if (cut <= 0) continue;
    const key = trimmed.slice(0, cut).trim();
    if (key !== "" && !keys.has(key)) keys.set(key, trimmed.slice(cut + 1).trim());
  }
  return { keys, lines };
}

function toLangName(value, fallback) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
}

function toBool(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

export default function langGapFiller({ settings }) {
  const raw =
    typeof settings === "object" && settings !== null && !Array.isArray(settings) ? settings : {};
  const defaultLang = toLangName(raw.defaultLang, DEFAULT_LANG);
  const fill = toBool(raw.fill, false);
  const files = new Map();
  return {
    name: "lang-gap-filler",
    match: (file) => typeof file.rel === "string" && file.rel.toLowerCase().endsWith(LANG_EXT),
    transform: (content, file) => {
      const base = fileBase(file.rel);
      if (base === null) return null;
      files.set(file.rel.replace(/\\/g, "/"), {
        kind: file.kind,
        base,
        ...parseLang(new TextDecoder().decode(content)),
      });
      return null;
    },
    emit: () => {
      const out = [];
      const defaults = [...files.values()].find((entry) => entry.base === defaultLang);
      if (!defaults) return out;
      const gaps = [];
      for (const [rel, entry] of files) {
        if (entry.base === defaultLang) continue;
        const missing = [...defaults.keys.keys()].filter((key) => !entry.keys.has(key));
        if (missing.length === 0) continue;
        gaps.push({ file: rel, language: entry.base, missing });
        if (fill) {
          const filled = [...entry.lines];
          if (filled.length > 0 && filled[filled.length - 1] !== "") filled.push("");
          filled.push(FILLED_MARK);
          for (const key of missing) filled.push(`${key}=${defaults.keys.get(key)}`);
          filled.push("");
          out.push({
            kind: entry.kind,
            rel,
            content: new TextEncoder().encode(filled.join("\n")),
          });
        }
      }
      if (gaps.length > 0) {
        const side = [...files.values()].find((entry) => entry.base !== defaultLang);
        out.push({
          kind: side ? side.kind : "RP",
          rel: REPORT_FILE,
          content: new TextEncoder().encode(`${JSON.stringify({ gaps }, null, 2)}\n`),
        });
      }
      return out;
    },
  };
}
