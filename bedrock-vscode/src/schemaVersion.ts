import * as vscode from "vscode";

import { isRecord } from "@aplok/bedrock-builder";

import {
  REGISTRY_URL,
  SCHEMA_VERSION_BETA,
  SCHEMA_VERSION_LATEST,
  VERSION_EXACT,
  VERSION_LIST_LIMIT,
} from "./constants.js";

export interface RegistryData {
  tags: { latest: string; beta: string };
  versions: string[];
}

// fetch the npm registry doc once, return tags plus a trimmed version list.
export async function fetchRegistry(): Promise<RegistryData> {
  const res = await fetch(REGISTRY_URL);
  if (!res.ok) throw new Error(`Schema registry ${res.status}.`);
  const doc: unknown = await res.json();
  if (!isRecord(doc)) throw new Error("Bad schema registry response.");
  const tagsRaw = doc["dist-tags"];
  if (!isRecord(tagsRaw)) throw new Error("Schema registry has no dist-tags.");
  const latest = tagsRaw["latest"];
  const beta = tagsRaw["beta"];
  if (typeof latest !== "string" || typeof beta !== "string")
    throw new Error("Schema registry tags are missing.");
  const versionsRaw = doc["versions"];
  const versions = isRecord(versionsRaw) ? Object.keys(versionsRaw) : [];
  return { tags: { latest, beta }, versions: versions.slice(-VERSION_LIST_LIMIT) };
}

// resolve a setting value to an exact version. latest and beta come
// from the registry, exact values must match the registry list when known.
export function resolveVersion(wanted: string, registry: RegistryData): string {
  const clean = wanted.trim().toLowerCase();
  if (clean === "" || clean === SCHEMA_VERSION_LATEST) return registry.tags.latest;
  if (clean === SCHEMA_VERSION_BETA) return registry.tags.beta;
  if (!VERSION_EXACT.test(clean))
    throw new Error(`Schema version "${wanted}" must be latest, beta, or exact.`);
  if (registry.versions.length > 0 && !registry.versions.includes(clean))
    throw new Error(`Schema version ${clean} is not on npm.`);
  return clean;
}

export async function pickVersion(
  registry: RegistryData,
  current: string,
): Promise<string | undefined> {
  const items: vscode.QuickPickItem[] = [
    {
      label: `latest (${registry.tags.latest})`,
      description: current === registry.tags.latest ? "current" : "",
    },
    {
      label: `beta (${registry.tags.beta})`,
      description: current === registry.tags.beta ? "current" : "",
    },
    ...registry.versions
      .slice()
      .reverse()
      .map((version) => ({
        label: version,
        description: version === current ? "current" : "",
      })),
  ];
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: "Select Mojang schema version",
  });
  if (!picked) return undefined;
  if (picked.label.startsWith("latest")) return registry.tags.latest;
  if (picked.label.startsWith("beta")) return registry.tags.beta;
  return picked.label;
}
