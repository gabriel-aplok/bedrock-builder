import type { Tree } from "./tree.js";
import type { PlannedFile } from "./types.js";

export function planTree(tree: Tree, force: boolean): PlannedFile[] {
  const plan: PlannedFile[] = [];
  for (const relPath of tree.paths()) {
    const nextContent = tree.writes.get(relPath)!;
    const prev = readDisk(tree, relPath);
    let status: PlannedFile["status"];
    if (prev === null) status = "create";
    else if (prev === nextContent) status = "skip";
    else if (tree.mergePaths.has(relPath)) status = "update";
    else if (force) status = "overwrite";
    else status = "conflict";
    plan.push({ relPath, absPath: tree.abs(relPath), nextContent, status });
  }
  return plan;
}

function readDisk(tree: Tree, rel: string): string | null {
  const staged = tree.writes.get(rel);
  tree.writes.delete(rel);
  const found = tree.read(rel);
  if (staged !== undefined) tree.writes.set(rel, staged);
  return found;
}

export function hasConflict(plan: readonly PlannedFile[]): boolean {
  return plan.some((file) => file.status === "conflict");
}
