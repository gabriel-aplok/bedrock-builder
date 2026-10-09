import { applyEdits, modify, parse, stripComments } from "jsonc-parser";

function cleanJson(content, settings = {}) {
  const text = new TextDecoder().decode(content);
  let next = text;
  const errors = [];
  parse(next, errors);
  if (errors.length > 0) return null;
  if (settings.stripSchemas === true) {
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

export default function jsonCleaner({ settings }) {
  return {
    name: "json-cleaner",
    match: (file) => file.rel.toLowerCase().endsWith(".json"),
    transform: (content) =>
      cleanJson(content, {
        stripSchemas: settings.stripSchemas === true,
        minify: settings.minify === true,
      }),
  };
}
