// tolerant jsonc parse with trailing commas for hand-edited packs.
export function stripJsonc(text: string): string {
  let out = "";
  let at = 0;
  while (at < text.length) {
    const char = text[at]!;
    if (char === '"') {
      const end = scanString(text, at);
      out += text.slice(at, end);
      at = end;
      continue;
    }
    if (char === "/" && text[at + 1] === "/") {
      while (at < text.length && text[at] !== "\n") at++;
      continue;
    }
    if (char === "/" && text[at + 1] === "*") {
      const close = text.indexOf("*/", at + 2);
      at = close === -1 ? text.length : close + 2;
      continue;
    }
    if (char === ",") {
      let next = at + 1;
      while (next < text.length && " \t\r\n".includes(text[next]!)) next++;
      const follows = text[next];
      if (follows === "}" || follows === "]") {
        at++;
        continue;
      }
    }
    out += char;
    at++;
  }
  return out;
}

// end offset past the closing quote, or text length on unterminated.
function scanString(text: string, at: number): number {
  let end = at + 1;
  while (end < text.length) {
    if (text[end] === "\\") {
      end += 2;
      continue;
    }
    if (text[end] === '"') return end + 1;
    end++;
  }
  return end;
}

export function parseJsonc(text: string): unknown {
  return JSON.parse(stripJsonc(text));
}
