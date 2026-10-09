import * as vscode from "vscode";

import {
  FILE_REF_EXTS,
  GEOMETRY_NAME,
  IDENTIFIER_VALUE,
  MAX_HITS,
  MAX_INDEX_FILES,
  MAX_SCAN_BYTES,
} from "./constants.js";
import { resolveProject } from "./config.js";

export interface IndexHit {
  file: vscode.Uri;
  line: number;
  kind: string;
}

const SEARCHERS: { kind: string; pattern: (id: string) => RegExp }[] = [
  {
    kind: "identifier",
    pattern: (id) => new RegExp(`"identifier"\\s*:\\s*"${escapeRe(id)}"`, "g"),
  },
  {
    kind: "reference",
    pattern: (id) => new RegExp(`"${escapeRe(id)}"`, "g"),
  },
  {
    kind: "geometry",
    pattern: (id) => new RegExp(`"${escapeRe(id)}"`, "g"),
  },
  {
    kind: "file",
    pattern: (id) => new RegExp(escapeRe(id), "g"),
  },
];

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// current word: identifier, geometry/controller/animation name, or file ref.
// null when the cursor sits on plain text.
export function wordAt(
  document: vscode.TextDocument,
  position: vscode.Position,
): { text: string; kind: string } | null {
  const line = document.lineAt(position.line).text;
  const idRe = new RegExp(`"(${IDENTIFIER_VALUE})"`, "g");
  const geoRe = new RegExp(`"(${GEOMETRY_NAME})"`, "g");
  const fileRe = new RegExp(`"([\\w./-]*(${FILE_REF_EXTS.map(escapeRe).join("|")}))"`, "g");
  for (const { re, kind } of [
    { re: idRe, kind: "identifier" },
    { re: geoRe, kind: "geometry" },
    { re: fileRe, kind: "file" },
  ] as const) {
    for (const hit of line.matchAll(re)) {
      const start = (hit.index ?? -1) + 1;
      const end = start + hit[1]!.length;
      const cursor = position.character;
      if (cursor >= start && cursor <= end) return { text: hit[1]!, kind };
    }
  }
  return null;
}

export async function findDefinition(
  target: { text: string; kind: string },
  doc: vscode.TextDocument,
): Promise<IndexHit[]> {
  const hits: IndexHit[] = [];
  if (target.kind === "file") {
    const found = await resolveFileRef(doc, target.text);
    if (found) hits.push({ file: found, line: 0, kind: "file" });
  }
  const searcher = SEARCHERS.find((entry) => entry.kind === target.kind) ?? SEARCHERS[1]!;
  const files = await packJsonFiles(doc);
  for (const file of files.slice(0, MAX_INDEX_FILES)) {
    const text = await readCapped(file);
    if (text === undefined) continue;
    if (!text.includes(target.text)) continue;
    const re = searcher.pattern(target.text);
    for (const hit of text.matchAll(re)) {
      const line = lineOf(text, hit.index ?? 0);
      hits.push({ file, line, kind: searcher.kind });
      if (hits.length >= MAX_HITS) return hits;
    }
    if (hits.length >= MAX_HITS) break;
  }
  return hits;
}

async function packJsonFiles(doc: vscode.TextDocument): Promise<vscode.Uri[]> {
  try {
    const project = await resolveProject();
    const bp = new vscode.RelativePattern(project.config.packs.bp, "**/*.json");
    const rp = new vscode.RelativePattern(project.config.packs.rp, "**/*.json");
    const [bpFiles, rpFiles] = await Promise.all([
      vscode.workspace.findFiles(bp, "**/node_modules/**", MAX_INDEX_FILES),
      vscode.workspace.findFiles(rp, "**/node_modules/**", MAX_INDEX_FILES),
    ]);
    const both = [...bpFiles, ...rpFiles];
    if (both.length > 0) return both;
  } catch {
    // fall through to the workspace-wide scan below.
  }
  const folder = vscode.workspace.getWorkspaceFolder(doc.uri);
  const base = folder ? new vscode.RelativePattern(folder, "packs/**/*.json") : "packs/**/*.json";
  return vscode.workspace.findFiles(base, "**/node_modules/**", MAX_INDEX_FILES);
}

async function readCapped(file: vscode.Uri): Promise<string | undefined> {
  try {
    const raw = await vscode.workspace.fs.readFile(file);
    if (raw.length > MAX_SCAN_BYTES) return undefined;
    return Buffer.from(raw).toString("utf8");
  } catch {
    return undefined;
  }
}

function lineOf(text: string, index: number): number {
  let line = 0;
  for (let at = 0; at < index; at++) if (text[at] === "\n") line++;
  return line;
}

async function resolveFileRef(
  doc: vscode.TextDocument,
  ref: string,
): Promise<vscode.Uri | undefined> {
  const folder = vscode.workspace.getWorkspaceFolder(doc.uri);
  if (!folder) return undefined;
  const clean = ref.replace(/^\.\//, "");
  const candidates = [
    vscode.Uri.joinPath(folder.uri, clean),
    vscode.Uri.joinPath(folder.uri, "packs/BP", clean),
    vscode.Uri.joinPath(folder.uri, "packs/RP", clean),
  ];
  try {
    const project = await resolveProject();
    candidates.unshift(
      vscode.Uri.joinPath(vscode.Uri.file(project.config.packs.bp), clean),
      vscode.Uri.joinPath(vscode.Uri.file(project.config.packs.rp), clean),
    );
  } catch {
    // project may not load, fall back to the folder candidates.
  }
  for (const candidate of candidates) {
    try {
      await vscode.workspace.fs.stat(candidate);
      return candidate;
    } catch {
      // try the next candidate.
    }
  }
  return undefined;
}
