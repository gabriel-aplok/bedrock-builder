import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

export class Tree {
  readonly writes = new Map<string, string>();
  readonly mergePaths = new Set<string>();
  readonly rootAbs: string;

  constructor(rootAbs: string) {
    this.rootAbs = rootAbs;
  }

  abs(rel: string): string {
    return isAbsolute(rel) ? rel : resolve(this.rootAbs, rel);
  }

  exists(rel: string): boolean {
    return this.writes.has(rel) || existsSync(this.abs(rel));
  }

  read(rel: string): string | null {
    if (this.writes.has(rel)) return this.writes.get(rel)!;
    const abs = this.abs(rel);
    if (!existsSync(abs)) return null;
    try {
      return readFileSync(abs, "utf8");
    } catch {
      return null;
    }
  }

  write(rel: string, content: string): void {
    this.writes.set(rel, content);
  }

  writeMerge(rel: string, content: string): void {
    this.writes.set(rel, content);
    this.mergePaths.add(rel);
  }

  paths(): string[] {
    return [...this.writes.keys()].sort();
  }

  async flush(): Promise<void> {
    for (const rel of this.paths()) {
      const abs = this.abs(rel);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, this.writes.get(rel)!, "utf8");
    }
  }
}
