import type { BedrockConfig } from "../config.js";
import { GenerateError } from "./core/errors.js";
import { openPlan } from "./core/setup.js";
import type { Tree } from "./core/tree.js";
import type { CreateOptions, GeneratorResult } from "./core/types.js";
import { renderTradeJson } from "./templates/trade.js";

function parseTradeId(raw: string, field: string): string {
  const id = raw.trim();
  if (id === "" || !id.includes(":")) {
    throw new GenerateError(`${field} must be a namespaced id like "minecraft:emerald".`);
  }
  return id;
}

function parseTradeOpt(raw: number | undefined, field: string): number | undefined {
  if (raw === undefined) return undefined;
  if (!Number.isInteger(raw) || raw < 0) {
    throw new GenerateError(`${field} must be an integer >= 0, got ${raw}.`);
  }
  return raw;
}

function parseTradeInt(raw: number | undefined, fallback: number, field: string): number {
  const value = raw ?? fallback;
  if (!Number.isInteger(value) || value < 1) {
    throw new GenerateError(`${field} must be an integer >= 1, got ${raw}.`);
  }
  return value;
}

export function planTrade(tree: Tree, config: BedrockConfig, opts: CreateOptions): GeneratorResult {
  const scope = openPlan(config, opts);
  const { raw, bpRel } = scope;
  const want = opts.want?.trim() ? parseTradeId(opts.want, "want") : "minecraft:emerald";
  const give = opts.give?.trim() ? parseTradeId(opts.give, "give") : scope.names.identifier;
  const wantMin = parseTradeInt(opts.min, 1, "min");
  const wantMax = parseTradeInt(opts.max, 1, "max");
  if (wantMin > wantMax) throw new GenerateError(`min ${wantMin} is above max ${wantMax}.`);

  const maxUses = parseTradeOpt(opts.maxUses, "max-uses");
  const xp = parseTradeOpt(opts.xp, "xp");
  tree.write(
    `${bpRel}/trading/${raw}.json`,
    renderTradeJson({ want, wantMin, wantMax, give, maxUses, xp }),
  );
  const extras = [
    maxUses === undefined ? null : `${maxUses} uses`,
    xp === undefined ? null : `${xp} xp`,
  ].filter((part) => part !== null);
  const suffix = extras.length > 0 ? ` (${extras.join(", ")})` : "";
  return { notes: [`Trade ${wantMin}-${wantMax}x ${want} for ${give}${suffix}.`] };
}
