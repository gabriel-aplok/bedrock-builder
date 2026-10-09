import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export interface ManifestTarget {
  kind: "BP" | "RP";
  // absolute path to the manifest.json.
  path: string;
}

export interface RewriteOptions {
  name: string;
  // bump the header and module version to this, when given.
  version?: string | undefined;
}

export interface RewrittenManifest {
  kind: "BP" | "RP";
  path: string;
  content: string;
}

export interface RewriteReport {
  targets: RewrittenManifest[];
  // human lines describing what changed.
  changes: string[];
}

function isObj(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function firstSubfolderManifest(dir: string): Promise<string | null> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const sub = entries.find((e) => e.isDirectory());
    if (sub === undefined) return null;
    const path = join(dir, sub.name, "manifest.json");
    return (await isFile(path)) ? path : null;
  } catch {
    return null;
  }
}

// known pack layouts, most common first.
export async function detectPackLayout(root: string): Promise<ManifestTarget[]> {
  const customBp = join(root, "packs", "BP", "manifest.json");
  const customRp = join(root, "packs", "RP", "manifest.json");
  if ((await isFile(customBp)) || (await isFile(customRp))) {
    return layoutFrom(customBp, customRp, await isFile(customBp), await isFile(customRp));
  }

  const flatBp = join(root, "BP", "manifest.json");
  const flatRp = join(root, "RP", "manifest.json");
  if ((await isFile(flatBp)) || (await isFile(flatRp))) {
    return layoutFrom(flatBp, flatRp, await isFile(flatBp), await isFile(flatRp));
  }

  const msBp = await firstSubfolderManifest(join(root, "behavior_packs"));
  const msRp = await firstSubfolderManifest(join(root, "resource_packs"));
  return layoutFrom(msBp, msRp, msBp !== null, msRp !== null);
}

function layoutFrom(
  bp: string | null,
  rp: string | null,
  hasBp: boolean,
  hasRp: boolean,
): ManifestTarget[] {
  const out: ManifestTarget[] = [];
  if (hasBp && bp !== null) out.push({ kind: "BP", path: bp });
  if (hasRp && rp !== null) out.push({ kind: "RP", path: rp });
  return out;
}

function parseVersion(text: string): [number, number, number] {
  const parts = text.split(".").map((p) => Number(p));
  return [parts[0] ?? 1, parts[1] ?? 0, parts[2] ?? 0];
}

// rewrite one manifest in place: fresh header and module uuids, names
// from the project, and cross-linked pack dependencies.
export function rewriteManifest(
  raw: unknown,
  kind: "BP" | "RP",
  options: RewriteOptions,
  headerUuid: string,
  otherHeaderUuid: string | null,
): { content: string; changes: string[] } {
  if (!isObj(raw)) throw new Error("manifest is not a json object");
  const changes: string[] = [];
  const manifest: Record<string, unknown> = { ...raw };

  if (isObj(manifest.header)) {
    const header = { ...manifest.header };
    header.uuid = headerUuid;
    header.name = `${options.name} ${kind}`;
    if (options.version !== undefined) {
      header.version = parseVersion(options.version);
    }
    manifest.header = header;
    changes.push(`${kind} header.uuid -> ${headerUuid}`);
  }

  const modules = manifest.modules;
  if (Array.isArray(modules)) {
    manifest.modules = modules.map((mod) => {
      if (!isObj(mod)) return mod;
      const next: Record<string, unknown> = { ...mod, uuid: randomUUID() };
      if (options.version !== undefined) next.version = parseVersion(options.version);
      return next;
    });
    changes.push(`${kind} modules -> ${modules.length} fresh uuids`);
  }

  const deps = manifest.dependencies;
  if (otherHeaderUuid !== null && Array.isArray(deps)) {
    let linked = 0;
    manifest.dependencies = deps.map((dep) => {
      if (!isObj(dep) || typeof dep.uuid !== "string") return dep;
      linked++;
      return { ...dep, uuid: otherHeaderUuid };
    });
    if (linked > 0) changes.push(`${kind} deps -> ${otherHeaderUuid}`);
  }

  return { content: `${JSON.stringify(manifest, null, 2)}\n`, changes };
}

// rewrite every target with fresh uuids, cross-linking the two packs.
export async function rewriteManifests(
  targets: readonly ManifestTarget[],
  options: RewriteOptions,
): Promise<RewriteReport> {
  const bp = targets.find((t) => t.kind === "BP");
  const rp = targets.find((t) => t.kind === "RP");
  const bpUuid = randomUUID();
  const rpUuid = randomUUID();

  const out: RewrittenManifest[] = [];
  const changes: string[] = [];
  for (const target of targets) {
    const raw = JSON.parse(await readFile(target.path, "utf8")) as unknown;
    const headerUuid = target.kind === "BP" ? bpUuid : rpUuid;
    const otherUuid = target.kind === "BP" ? (rp ? rpUuid : null) : bp ? bpUuid : null;
    const result = rewriteManifest(raw, target.kind, options, headerUuid, otherUuid);
    out.push({ kind: target.kind, path: target.path, content: result.content });
    changes.push(...result.changes);
  }
  return { targets: out, changes };
}
