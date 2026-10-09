import esbuild, { type BuildContext, type BuildOptions as EsbuildOptions } from "esbuild";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { BedrockConfig } from "./config.js";
import { logger } from "./logger.js";

export const RUNTIME_MODULES = [
  "@minecraft/server",
  "@minecraft/server-ui",
  "@minecraft/server-net",
  "@minecraft/server-admin",
  "@minecraft/server-gametest",
];

export interface BuildOptions {
  release: boolean;
}

export interface BuildResult {
  elapsedMs: number;
  outputPath: string;
}

function bundlePath(config: BedrockConfig): string {
  return join(bundleDir(config), "main.js");
}

export function bundleDir(config: BedrockConfig): string {
  return join(config.out, "packs", "BP", "scripts");
}

function esbuildFlags(config: BedrockConfig, dev: boolean, dest: string): EsbuildOptions {
  return {
    entryPoints: [config.entry],
    outfile: dest,
    target: "es2020",
    format: "esm",
    platform: "neutral",
    bundle: true,
    external: [...RUNTIME_MODULES],
    sourcemap: dev ? "inline" : false,
    minify: !dev,
    logLevel: "silent",
  };
}

interface Diag {
  text: string;
  location?: { file: string; line: number; column: number } | null;
}

function renderDiags(items: Diag[]): string {
  return items
    .map((item) => {
      const at = item.location;
      return at ? `${at.file}:${at.line}:${at.column}: ${item.text}` : item.text;
    })
    .join("\n");
}

function failMessage(err: unknown): string {
  const details = (err as { errors?: Diag[] }).errors;
  if (details && details.length > 0) return renderDiags(details);
  return err instanceof Error ? err.message : String(err);
}

export class BundlerError extends Error {
  readonly exitCode = 7;
  constructor(message: string) {
    super(message);
    this.name = "BundlerError";
  }
}

export async function buildBundle(
  config: BedrockConfig,
  options: BuildOptions,
): Promise<BuildResult> {
  const dest = bundlePath(config);
  await mkdir(dirname(dest), { recursive: true });

  const started = Date.now();
  try {
    const out = await esbuild.build(esbuildFlags(config, !options.release, dest));
    if (out.warnings.length > 0) logger.warn(`esbuild: ${renderDiags(out.warnings)}`);
  } catch (err) {
    throw new BundlerError(failMessage(err));
  }
  return { elapsedMs: Date.now() - started, outputPath: dest };
}

export async function buildBundleWithWatch(
  config: BedrockConfig,
  options: BuildOptions,
  rebuilt: (result: BuildResult) => void | Promise<void>,
): Promise<{ dispose: () => Promise<void> }> {
  const dest = bundlePath(config);
  await mkdir(dirname(dest), { recursive: true });

  let ctx: BuildContext | null = null;
  let mark = Date.now();
  const flags: EsbuildOptions = {
    ...esbuildFlags(config, !options.release, dest),
    plugins: [
      {
        name: "bedrock-builder-watch-notify",
        setup(hooks) {
          hooks.onStart(() => {
            mark = Date.now();
          });
          hooks.onEnd(async (done) => {
            if (done.errors.length > 0) {
              logger.error(`esbuild: ${renderDiags(done.errors)}`);
              return;
            }
            if (done.warnings.length > 0) logger.warn(`esbuild: ${renderDiags(done.warnings)}`);
            try {
              await rebuilt({ elapsedMs: Date.now() - mark, outputPath: dest });
            } catch (err) {
              logger.error(
                `rebuild hook failed: ${err instanceof Error ? err.message : String(err)}`,
              );
            }
          });
        },
      },
    ],
  };

  ctx = await esbuild.context(flags);
  await ctx.watch();
  return {
    dispose: async () => {
      if (ctx) {
        await ctx.dispose();
        ctx = null;
      }
    },
  };
}
