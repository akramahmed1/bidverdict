# Budget

Credits on hand (Nebius console, 2026-10-15): **$50.00 account balance** (two $25 promo codes) plus a $1.00 trial credit. Tavily: Builders Program credit claimed; balance to be confirmed after the first call.

Nebius has no documented spending cap and charges the card on a negative balance. Caps are therefore enforced in code (`src/lib/budget.ts`) and kept below the credit balance.

## Prices (console, 2026-10-15, per 1M tokens)

| Tier | In | Out |
|---|---|---|
| Nano | $0.06 | $0.24 |
| Super | $0.30 | $0.90 |
| Ultra | $1.00 | $3.00 |

## Measured cost of one full memo

Measured 2026-10-16 on live Nebius Token Factory (run log: `runs/run-2026-10-16T23-30-09-013Z.json`, test input, 17 sources, 6 validated claims).

| Step | Tier | Input tokens | Output tokens | Cost |
|---|---|---|---|---|
| classify | nano | 153 | 151 | $0.000045 |
| synthesize | super | 3,259 | 2,713 | $0.003419 |
| verdict | ultra | 601 | 1,812 | $0.006037 |
| **Total** | | 4,013 | 4,676 | **$0.009501** |

About one cent per memo, plus one Tavily credit per search (3 per memo). Reconcile against the console Usage tab before Oct 20.

## Caps (set from the measured memo)

| Cap | Value | Rule |
|---|---|---|
| Per run | $0.05 | about 5x the measured memo; the worst-case pre-call check needs headroom for max_tokens |
| Daily live (public demo) | $2.00 | about 200 live memos a day |
| Global | $40.00 | below the $50 balance |
| Max loops per run | 12 | a run uses 4 calls; the worst case with every retry and escalation is 10 |

## Plan for the $50

`$50 - dev spend to date - eval runs - demo reserve through Dec 15 = margin`. To be filled with real numbers on Oct 17 and updated Oct 20.
