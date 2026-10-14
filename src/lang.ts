// bedrock .lang file parser. vscode-free so tests can import it.
export interface LangEntry {
  key: string;
  value: string;
  line: number;
  keyStart: number;
  keyEnd: number;
  valueStart: number;
}

export interface LangProblem {
  line: number;
  start: number;
  end: number;
  message: string;
}

// one key=value pair per line; ## comments and blanks skip. key trimmed, value keeps spacing.
export function parseLang(text: string): { entries: LangEntry[]; problems: LangProblem[] } {
  const entries: LangEntry[] = [];
  const problems: LangProblem[] = [];
  const lines = text.split("\n");
  for (const [line, raw] of lines.entries()) {
    const stripped = raw.replace(/\r$/, "");
    if (stripped.trim() === "" || stripped.trimStart().startsWith("##")) continue;
    const cut = stripped.indexOf("=");
    if (cut === -1) {
      problems.push({ line, start: 0, end: stripped.length, message: "expected key=value" });
      continue;
    }
    const key = stripped.slice(0, cut).trim();
    if (key === "") {
      problems.push({ line, start: 0, end: cut, message: "empty lang key" });
      continue;
    }
    const keyStart = stripped.indexOf(key);
    entries.push({
      key,
      value: stripped.slice(cut + 1),
      line,
      keyStart,
      keyEnd: keyStart + key.length,
      valueStart: cut + 1,
    });
  }
  return { entries, problems };
}

// find duplicate keys across and within files; callers map ids.
export function findLangDuplicates(
  files: { id: string; text: string }[],
): { key: string; ids: string[] }[] {
  const counts = new Map<string, number>();
  const owners = new Map<string, Set<string>>();
  for (const file of files) {
    for (const entry of parseLang(file.text).entries) {
      counts.set(entry.key, (counts.get(entry.key) ?? 0) + 1);
      const set = owners.get(entry.key) ?? new Set<string>();
      set.add(file.id);
      owners.set(entry.key, set);
    }
  }
  const out: { key: string; ids: string[] }[] = [];
  for (const [key, set] of owners) {
    if ((counts.get(key) ?? 0) > 1) out.push({ key, ids: [...set] });
  }
  out.sort((a, b) => (a.key < b.key ? -1 : 1));
  return out;
}

// key under the cursor on a key=value line. null on comments and values.
export function langKeyAt(line: string, character: number): string | null {
  const clean = line.replace(/\r$/, "");
  if (clean.trim() === "" || clean.trimStart().startsWith("##")) return null;
  const cut = clean.indexOf("=");
  if (cut === -1) return null;
  const key = clean.slice(0, cut).trim();
  if (key === "") return null;
  const start = clean.indexOf(key);
  if (character >= start && character <= start + key.length) return key;
  return null;
}

// translate key under the cursor, for "translate": "tile.dirt.name".
export function translateKeyAt(line: string, character: number): string | null {
  for (const hit of line.matchAll(/"translate"\s*:\s*"([^"]+)"/g)) {
    const key = hit[1]!;
    const start = (hit.index ?? -1) + hit[0]!.indexOf(key);
    if (character >= start && character <= start + key.length) return key;
  }
  return null;
}
