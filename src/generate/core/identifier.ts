const VANILLA = new Set(["minecraft", "minecon"]);

export function validateName(raw: string): true | string {
  if (/^[a-z][a-z_]*$/.test(raw)) return true;
  return `"${raw}" is not a valid name. Use lowercase letters and underscores, like item_name.`;
}

export function validateIdentifier(id: string): true | string {
  const hit = /^([a-z][a-z_]*):([a-z][a-z_]*)$/.exec(id);
  if (!hit)
    return "Use namespace:name with lowercase letters and underscores, like my_addon:fire_sword.";
  if (VANILLA.has(hit[1]!)) return `The "${hit[1]}" namespace belongs to vanilla content.`;
  return true;
}

export function validateNamespace(ns: string): true | string {
  if (!/^[a-z][a-z_]*$/.test(ns)) {
    return `"${ns}" is not a valid namespace. Use lowercase letters and underscores, like my_addon.`;
  }
  if (VANILLA.has(ns)) return `The "${ns}" namespace belongs to vanilla content.`;
  return true;
}

export function deriveNamespace(name: string): string {
  const clean = name
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^([0-9])/, "ns_$1");
  return clean || "ns";
}
