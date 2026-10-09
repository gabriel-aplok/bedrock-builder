import chokidar, { type FSWatcher } from "chokidar";
import { readFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";

import type { BedrockConfig } from "./config.js";
import { logger } from "./logger.js";

export const WATCH_DEBOUNCE_MS = 100;

export type WatchEvent = "add" | "change";

export class SaveBatcher {
  private pending = new Map<string, WatchEvent>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flush: (files: Map<string, WatchEvent>) => void;
  private windowMs: number;

  constructor(
    flush: (files: Map<string, WatchEvent>) => void,
    windowMs: number = WATCH_DEBOUNCE_MS,
  ) {
    this.flush = flush;
    this.windowMs = windowMs;
  }

  push(file: string, event: WatchEvent): void {
    this.pending.set(file, event);
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const files = this.pending;
      this.pending = new Map();
      this.flush(files);
    }, this.windowMs);
  }
}

export function timestamp(): string {
  const now = new Date();
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(now.getHours())}:${two(now.getMinutes())}:${two(now.getSeconds())}`;
}

function inside(root: string, path: string): boolean {
  return path === root || path.startsWith(`${root}/`) || path.startsWith(`${root}\\`);
}

// version control plus dependency dirs, never watched.
const SKIP_DIRS = [".git", "node_modules"] as const;

export function isSkippedDir(path: string): boolean {
  return path.split(/[/\\]/).some((part) => (SKIP_DIRS as readonly string[]).includes(part));
}

export function isTempFile(path: string): boolean {
  const base = basename(path);
  return (
    base.startsWith(".") ||
    base.startsWith("~") ||
    base.endsWith("~") ||
    base.endsWith(".tmp") ||
    base.endsWith(".swp") ||
    base.endsWith(".swo") ||
    base.endsWith(".swx") ||
    base.endsWith(".part") ||
    base.endsWith(".lock")
  );
}

// minimal gitignore matcher: blank lines, comments, dir prefixes,
// star globs, and negation with !. enough for project ignores.
export interface IgnoreRules {
  patterns: string[];
}

export function parseIgnoreFile(text: string): IgnoreRules {
  const patterns: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    patterns.push(line);
  }
  return { patterns };
}

export async function loadIgnoreFile(dir: string): Promise<IgnoreRules> {
  try {
    const text = await readFile(join(dir, ".gitignore"), "utf8");
    return parseIgnoreFile(text);
  } catch {
    return { patterns: [] };
  }
}

function globToRegExp(glob: string): RegExp {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i]!;
    if (char === "*") {
      if (glob[i + 1] === "*") {
        out += ".*";
        i++;
      } else {
        out += "[^/]*";
      }
    } else if (char === "?") {
      out += "[^/]";
    } else if (".+()|^${}[]\\".includes(char)) {
      out += `\\${char}`;
    } else {
      out += char;
    }
  }
  return new RegExp(`^${out}$`);
}

function matchOne(pattern: string, rel: string): boolean {
  const dirOnly = pattern.endsWith("/");
  const body = dirOnly ? pattern.slice(0, -1) : pattern;
  const anchored = body.includes("/");
  if (anchored) {
    const target = dirOnly ? `${rel}/` : rel;
    if (globToRegExp(body).test(target)) return true;
    return dirOnly && rel.startsWith(`${body}/`);
  }
  for (const part of rel.split("/")) {
    if (globToRegExp(body).test(part)) return true;
  }
  return false;
}

// last matching pattern wins, ! un-ignores.
export function isIgnoredBy(rules: IgnoreRules, rel: string): boolean {
  const clean = rel.replace(/\\/g, "/").replace(/^\.\//, "");
  let ignored = false;
  for (const pattern of rules.patterns) {
    const negated = pattern.startsWith("!");
    const body = negated ? pattern.slice(1) : pattern;
    if (matchOne(body, clean)) ignored = !negated;
  }
  return ignored;
}

export async function createPackWatcher(config: BedrockConfig): Promise<FSWatcher> {
  const scripts = join(config.packs.bp, "scripts");
  const out = config.out;
  const rules = await loadIgnoreFile(config.__configDir);
  if (rules.patterns.length > 0) {
    logger.debug(`watch ignores: ${rules.patterns.join(", ")}`);
  }
  return chokidar.watch([config.packs.bp, config.packs.rp], {
    ignored: (path: string) => {
      if (!path) return false;
      if (isTempFile(path)) return true;
      if (isSkippedDir(path)) return true;
      const rel = relative(config.__configDir, path);
      if (rel !== "" && isIgnoredBy(rules, rel)) return true;
      return inside(scripts, path) || inside(out, path);
    },
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 25 },
  });
}

export function waitForReady(watcher: FSWatcher): Promise<void> {
  return new Promise<void>((wake) => watcher.once("ready", wake));
}
