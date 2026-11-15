import { applyEdits, modify, parse, stripComments } from "jsonc-parser";

function cleanJson(content, settings = {}) {
  const text = new TextDecoder().decode(content);
  let next = text;
  const errors = [];
  const parsed = parse(next, errors);
  if (errors.length > 0) return null;
  if (
    settings.stripSchemas === true &&
    parsed !== null &&
    typeof parsed === "object" &&
    !Array.isArray(parsed)
  ) {
    next = applyEdits(
      next,
      modify(next, ["$schema"], undefined, {
        formattingOptions: { keepLines: !settings.minify },
      }),
    );
  }
  next = settings.minify === true ? JSON.stringify(parse(next)) : stripComments(next);
  return next === text ? null : new TextEncoder().encode(next);
}

export default function jsonCleaner({ settings } = {}) {
  const config =
    typeof settings === "object" && settings !== null && !Array.isArray(settings) ? settings : {};
  return {
    name: "json-cleaner",
    match: (file) => file.rel.toLowerCase().endsWith(".json"),
    transform: (content) =>
      cleanJson(content, {
        stripSchemas: config.stripSchemas === true,
        minify: config.minify === true,
      }),
  };
}
