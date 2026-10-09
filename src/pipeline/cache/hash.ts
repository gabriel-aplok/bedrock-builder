import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export interface HashSource {
  hashOf(abs: string): Promise<string>;
  forget(abs: string): void;
}

export class MemoHashes implements HashSource {
  private known = new Map<string, string>();

  reset(): void {
    this.known.clear();
  }

  async hashOf(abs: string): Promise<string> {
    const hit = this.known.get(abs);
    if (hit !== undefined) return hit;
    let bytes: Uint8Array;
    try {
      bytes = await readFile(abs);
    } catch {
      return "";
    }
    const hex = hashBytes(bytes);
    this.known.set(abs, hex);
    return hex;
  }

  forget(abs: string): void {
    this.known.delete(abs);
  }
}
