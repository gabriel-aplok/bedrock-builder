import { isRecord } from "../records.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface ManifestFinding {
  message: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ZERO_UUID = /^0{8}-0{4}-0{4}-0{4}-0{12}$/;

// highest engine bb knows as stable. a newer min_engine_version
// means the pack targets a game newer than this bb release.
const KNOWN_STABLE_ENGINE: [number, number, number] = [1, 21, 0];

// one semver shape for every version field in this file.
// accepts the bedrock triple [1, 0, 0] and the "1.0.0" string,
// always normalized to "1.0.0" text.
export function manifestVersion(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(trimmed)) return trimmed;
    return null;
  }
  if (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((part) => Number.isInteger(part) && (part as number) >= 0)
  ) {
    return (value as number[]).join(".");
  }
  return null;
}

function engineTriple(value: unknown): [number, number, number] | null {
  const text = manifestVersion(value);
  if (text === null) return null;
  const parts = text.split(".").slice(0, 3).map(Number);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function engineNewer(value: [number, number, number], stable: [number, number, number]): boolean {
  for (let i = 0; i < 3; i++) {
    if (value[i]! > stable[i]!) return true;
    if (value[i]! < stable[i]!) return false;
  }
  return false;
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
      if (manifestVersion(header[field]) === null) {
        findings.push({ message: `${label} manifest header.${field} is missing or bad: ${path}` });
      }
      continue;
    }
    const value = header[field];
    if (typeof value !== "string" || value.trim() === "") {
      findings.push({ message: `${label} manifest header.${field} is missing: ${path}` });
    }
  }
  const engine = engineTriple(header.min_engine_version);
  if (engine !== null && engineNewer(engine, KNOWN_STABLE_ENGINE)) {
    findings.push({
      message: `${label} manifest min_engine_version ${engine.join(".")} is newer than the known stable ${KNOWN_STABLE_ENGINE.join(".")}: ${path}`,
    });
  }
  const uuid = header.uuid;
  if (typeof uuid === "string" && uuid.trim() !== "") {
    if (ZERO_UUID.test(uuid)) {
      findings.push({ message: `${label} manifest header.uuid is all zeros: ${path}` });
    } else if (!UUID.test(uuid)) {
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
    if (manifestVersion(module.version) === null) {
      findings.push({ message: `${label} manifest module ${at} version is bad: ${path}` });
    }
    const id = module.uuid;
    if (typeof id !== "string" || !UUID.test(id)) {
      findings.push({ message: `${label} manifest module ${at} uuid is bad: ${path}` });
      continue;
    }
    if (ZERO_UUID.test(id)) {
      findings.push({ message: `${label} manifest module ${at} uuid is all zeros: ${path}` });
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
  const docs = new Map<string, Record<string, unknown>>();
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
    if (isRecord(parsed)) docs.set(label, parsed);
  }
  checkPackLink(docs.get("BP"), docs.get("RP"), join(rpDir, "manifest.json"), findings);
  return findings;
}

// the rp manifest should point at the bp header uuid when it
// declares dependencies. a missing link stays valid, a wrong
// one means the packs will not load as one addon.
function checkPackLink(
  bp: Record<string, unknown> | undefined,
  rp: Record<string, unknown> | undefined,
  rpPath: string,
  findings: ManifestFinding[],
): void {
  if (!isRecord(bp) || !isRecord(rp)) return;
  const bpHeader = bp.header;
  if (!isRecord(bpHeader)) return;
  const bpUuid = typeof bpHeader.uuid === "string" ? bpHeader.uuid : null;
  const bpVersion = manifestVersion(bpHeader.version);
  const deps = rp.dependencies;
  if (!Array.isArray(deps)) return;
  for (const dep of deps) {
    if (!isRecord(dep) || typeof dep.uuid !== "string") continue;
    if (bpUuid !== null && dep.uuid.toLowerCase() !== bpUuid.toLowerCase()) {
      findings.push({
        message: `RP manifest dependency ${dep.uuid} does not match the BP uuid ${bpUuid}: ${rpPath}`,
      });
    }
    if (bpVersion !== null) {
      const depVersion = isRecord(dep) ? manifestVersion(dep.version) : null;
      if (depVersion !== null && depVersion !== bpVersion) {
        findings.push({
          message: `RP manifest dependency version ${depVersion} does not match the BP version ${bpVersion}: ${rpPath}`,
        });
      }
    }
  }
}
