// bedrock § color table and line parser. vscode-free so tests can import it.
export interface MinecraftSpan {
  start: number;
  end: number;
  color: string | undefined;
  bold: boolean;
  italic: boolean;
  obfuscated: boolean;
}

interface MinecraftCode {
  color: string;
  name: string;
}

// foreground hex from the bedrock edition table on minecraft.wiki.
const COLOR_CODES: Record<string, MinecraftCode> = {
  "0": { color: "#000000", name: "black" },
  "1": { color: "#0000AA", name: "dark blue" },
  "2": { color: "#00AA00", name: "dark green" },
  "3": { color: "#00AAAA", name: "dark aqua" },
  "4": { color: "#AA0000", name: "dark red" },
  "5": { color: "#AA00AA", name: "dark purple" },
  "6": { color: "#FFAA00", name: "gold" },
  "7": { color: "#C5C5C5", name: "gray" },
  "8": { color: "#545454", name: "dark gray" },
  "9": { color: "#447FFF", name: "blue" },
  a: { color: "#54FF54", name: "green" },
  b: { color: "#54FFFF", name: "aqua" },
  c: { color: "#FF5454", name: "red" },
  d: { color: "#FF54FF", name: "light purple" },
  e: { color: "#FFFF54", name: "yellow" },
  f: { color: "#FFFFFF", name: "white" },
  g: { color: "#EFCE16", name: "minecoin gold" },
  h: { color: "#D9CCB8", name: "quartz" },
  i: { color: "#A9B4B7", name: "iron" },
  j: { color: "#8F727D", name: "netherite" },
  m: { color: "#EE222C", name: "redstone" },
  n: { color: "#C87363", name: "copper" },
  p: { color: "#FFBF1E", name: "gold (material)" },
  q: { color: "#13A045", name: "emerald" },
  s: { color: "#5FECFF", name: "diamond" },
  t: { color: "#577BFF", name: "lapis" },
  u: { color: "#B66CDD", name: "amethyst" },
  v: { color: "#FF6A00", name: "resin" },
  w: { color: "#8BB3FF", name: "party blue" },
};

export const MINECRAFT_COLOR_NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(COLOR_CODES).map(([code, entry]) => [code, entry.name]),
);

export function minecraftColorOf(code: string): string | undefined {
  return COLOR_CODES[code.toLowerCase()]?.color;
}

export function minecraftNameOf(code: string): string | undefined {
  return COLOR_CODES[code.toLowerCase()]?.name;
}

// code char under the cursor, whether on § or the char after it.
export function hoverCodeAt(line: string, character: number): string | undefined {
  for (const at of [character - 1, character]) {
    if (at >= 0 && line[at] === "§" && at + 1 < line.length) return line[at + 1];
  }
  return undefined;
}

// split on § markers into styled spans; bold/italic persist, §r clears all.
export function parseMinecraftLine(line: string): MinecraftSpan[] {
  const out: MinecraftSpan[] = [];
  let color: string | undefined;
  let bold = false;
  let italic = false;
  let obfuscated = false;
  let runStart = 0;
  let i = 0;
  const flush = (end: number): void => {
    if (end > runStart && (color !== undefined || bold || italic || obfuscated)) {
      out.push({ start: runStart, end, color, bold, italic, obfuscated });
    }
  };
  while (i < line.length) {
    if (line[i] !== "§" || i + 1 >= line.length) {
      i++;
      continue;
    }
    const code = line[i + 1]!.toLowerCase();
    const entry = COLOR_CODES[code];
    const isFormat = code === "l" || code === "o" || code === "k" || code === "r";
    if (!entry && !isFormat) {
      // unknown marker stays literal and unstyled.
      flush(i);
      i += 2;
      runStart = i;
      continue;
    }
    flush(i);
    if (code === "r") {
      color = undefined;
      bold = false;
      italic = false;
      obfuscated = false;
    } else if (code === "l") {
      bold = true;
    } else if (code === "o") {
      italic = true;
    } else if (code === "k") {
      obfuscated = true;
    } else {
      color = entry!.color;
    }
    i += 2;
    runStart = i;
  }
  flush(line.length);
  return out;
}
