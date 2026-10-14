import type { BedrockConfig } from "../../config.js";
import { GenerateError } from "./errors.js";
import { validateName } from "./identifier.js";
import { deriveNames, stripPng, type DerivedNames } from "./names.js";
import { packRoots, type PackRoots } from "./paths.js";
import type { CreateOptions } from "./types.js";

export interface PlanScope extends PackRoots {
  raw: string;
  names: DerivedNames;
}

export function openPlan(config: BedrockConfig, opts: CreateOptions): PlanScope {
  const raw = (opts.name ?? "").trim();
  const ok = validateName(raw);
  if (ok !== true) throw new GenerateError(ok);
  return {
    raw,
    names: deriveNames(config.namespace, raw, opts.displayName),
    ...packRoots(config),
  };
}

export function iconKey(opts: CreateOptions, fallback: string): string {
  return stripPng((opts.icon ?? fallback).trim());
}
