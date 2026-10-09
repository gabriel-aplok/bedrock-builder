import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface ManifestFinding {
  message: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function versionText(value: unknown): string | null {
  if (typeof value === "string" && value.trim() !== "") return value;
  if (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((part) => Number.isInteger(part) && (part as number) >= 0)
  ) {
    return (value as number[]).join(".");
  }
  return null;
}

function checkManifest(
  label: string,
  path: string,
  parsed: unknown,
  seenUuids: Map<string, string>,
  findings: ManifestFinding[],
): void {
  if (!isRecord(parsed)) {
    findings.push({ message: `${label} manifest is not a json object: ${path}` });
    return;
  }
  const header = parsed.header;
  if (!isRecord(header)) {
    findings.push({ message: `${label} manifest needs a header object: ${path}` });
    return;
  }
  for (const field of ["name", "description", "uuid", "version", "min_engine_version"]) {
    if (field === "version" || field === "min_engine_version") {
      if (versionText(header[field]) === null) {
        findings.push({ message: `${label} manifest header.${field} is missing or bad: ${path}` });
      }
      continue;
    }
    const value = header[field];
    if (typeof value !== "string" || value.trim() === "") {
      findings.push({ message: `${label} manifest header.${field} is missing: ${path}` });
    }
  }
  const uuid = header.uuid;
  if (typeof uuid === "string" && uuid.trim() !== "") {
    if (!UUID.test(uuid)) {
      findings.push({ message: `${label} manifest header.uuid is not a uuid: ${path}` });
    } else {
      const first = seenUuids.get(uuid.toLowerCase());
      if (first !== undefined) {
        findings.push({
          message: `duplicate pack uuid ${uuid}: first in ${first}, again in ${path}`,
        });
      } else {
        seenUuids.set(uuid.toLowerCase(), path);
      }
    }
  }
  const modules = parsed.modules;
  if (!Array.isArray(modules) || modules.length === 0) {
    findings.push({ message: `${label} manifest needs at least one module: ${path}` });
    return;
  }
  for (const [at, module] of modules.entries()) {
    if (!isRecord(module)) {
      findings.push({ message: `${label} manifest module ${at} is not an object: ${path}` });
      continue;
    }
    if (typeof module.type !== "string" || module.type.trim() === "") {
      findings.push({ message: `${label} manifest module ${at} needs a type: ${path}` });
    }
    if (versionText(module.version) === null) {
      findings.push({ message: `${label} manifest module ${at} version is bad: ${path}` });
    }
    const id = module.uuid;
    if (typeof id !== "string" || !UUID.test(id)) {
      findings.push({ message: `${label} manifest module ${at} uuid is bad: ${path}` });
      continue;
    }
    const first = seenUuids.get(id.toLowerCase());
    if (first !== undefined) {
      findings.push({
        message: `duplicate module uuid ${id}: first in ${first}, again in ${path}`,
      });
    } else {
      seenUuids.set(id.toLowerCase(), path);
    }
  }
}

export async function validatePackManifests(
  bpDir: string,
  rpDir: string,
): Promise<ManifestFinding[]> {
  const findings: ManifestFinding[] = [];
  const seenUuids = new Map<string, string>();
  for (const [label, dir] of [
    ["BP", bpDir],
    ["RP", rpDir],
  ] as const) {
    const path = join(dir, "manifest.json");
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(path, "utf8"));
    } catch {
      findings.push({ message: `${label} manifest unreadable: ${path}` });
      continue;
    }
    checkManifest(label, path, parsed, seenUuids, findings);
  }
  return findings;
}
