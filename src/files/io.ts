import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function writeBytes(dst: string, bytes: Uint8Array): Promise<void> {
  await mkdir(dirname(dst), { recursive: true });
  await writeFile(dst, bytes);
}

export async function copyEntry(src: string, dst: string): Promise<void> {
  await mkdir(dirname(dst), { recursive: true });
  await copyFile(src, dst);
}

export async function removeEntry(path: string): Promise<void> {
  await rm(path, { force: true });
}
