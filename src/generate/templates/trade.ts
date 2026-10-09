import { renderJson } from "./serialize.js";

export interface TradeTemplateOptions {
  want: string;
  wantMin: number;
  wantMax: number;
  give: string;
}

export function renderTradeJson(opts: TradeTemplateOptions): string {
  return renderJson({
    tiers: [
      {
        trades: [
          {
            wants: [
              {
                item: opts.want,
                quantity: { min: opts.wantMin, max: opts.wantMax },
              },
            ],
            gives: [{ item: opts.give }],
          },
        ],
      },
    ],
  });
}
