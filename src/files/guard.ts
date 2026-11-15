import { realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

export class PathGuardError extends Error {
  readonly exitCode = 2;
  constructor(message: string) {
    super(message);
    this.name = "PathGuardError";
  }
}

// realpath what exists so a symlinked ancestor cannot redirect the target.
async function settle(path: string): Promise<string> {
  const absolute = resolve(path);
  const parent = await realpath(dirname(absolute)).catch(() => dirname(absolute));
  return join(parent, basename(absolute));
}

function contained(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

// true when target is the path itself or holds it.
function covers(target: string, path: string): boolean {
  return target === path || contained(target, path);
}

// refuses a deletion target that is the directory itself or sits outside it.
export async function assertInside(root: string, target: string): Promise<string> {
  const base = await settle(root);
  const spot = await settle(target);
  if (!contained(base, spot)) {
    throw new PathGuardError(`Refusing to touch ${target}: it must sit inside ${root}.`);
  }
  return spot;
}

// refuses a target that is, or holds, any of the protected paths.
export async function assertRemovable(
  target: string,
  protectedPaths: readonly string[],
): Promise<string> {
  const spot = await settle(target);
  for (const path of protectedPaths) {
    if (covers(spot, await settle(path))) {
      throw new PathGuardError(
        `Refusing to remove ${target}: it is or contains ${path}. Set bb.out to a build folder.`,
      );
    }
  }
  return spot;
}

// sources and the config dir must never sit inside the folder we delete.
export function assertOutRemovable(config: {
  out: string;
  __configDir: string;
  packs: { bp: string; rp: string };
  entry: string;
}): Promise<string> {
  return assertRemovable(config.out, [
    config.__configDir,
    config.packs.bp,
    config.packs.rp,
    config.entry,
  ]);
}
