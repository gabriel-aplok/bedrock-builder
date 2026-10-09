export interface DerivedNames {
  name: string;
  namespace: string;
  identifier: string;
  atlasKey: string;
  displayName: string;
}

export function toDisplayName(name: string): string {
  return name
    .split("_")
    .filter((chunk) => chunk.length > 0)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}

export function stripPng(ref: string): string {
  return ref.replace(/\.png$/i, "");
}

export function deriveNames(namespace: string, name: string, displayName?: string): DerivedNames {
  return {
    name,
    namespace,
    identifier: `${namespace}:${name}`,
    atlasKey: `${namespace}_${name}`,
    displayName: displayName && displayName.trim() !== "" ? displayName : toDisplayName(name),
  };
}
