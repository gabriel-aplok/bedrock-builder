// heal mojang schema stores, vscode-free for node use.

// resolve a relative ref to a store path; null when remote or escaping.
export function resolveRefPath(owner: string, ref: string): string | null {
  const bare = ref.split("#")[0]!;
  if (bare === "") return null;
  const parts = owner.split("/").slice(0, -1);
  for (const part of bare.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) return null;
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  const resolved = parts.join("/");
  if (resolved === "" || resolved.split("/").includes("..")) return null;
  return resolved;
}

// absolute reference with a scheme, e.g. http:// or urn:.
function hasScheme(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(value);
}

// heal a schema json document: drop relative $id/$ref, use renamed copies.
export function healSchemaJson(owner: string, text: string, present: ReadonlySet<string>): string {
  if (!text.includes('"$id"') && !text.includes('"$ref"')) return text;
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return text;
  }
  let changed = false;
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node === null || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (typeof record.$id === "string" && !hasScheme(record.$id)) {
      delete record.$id;
      changed = true;
    }
    for (const key of Object.keys(record)) {
      const value = record[key];
      if (key === "$ref" && typeof value === "string" && value.startsWith(".")) {
        const target = resolveRefPath(owner, value);
        if (target === null || !present.has(target)) {
          delete record[key];
          changed = true;
          continue;
        }
      }
      walk(value);
    }
  };
  walk(doc);
  return changed ? JSON.stringify(doc, null, 2) : text;
}
