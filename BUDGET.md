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

**Not yet measured.** It will be filled in on Oct 17 from the first full live run, broken down by tier, and reconciled against the console Usage tab.

| Step | Tier | Input tokens | Output tokens | Cost |
|---|---|---|---|---|
| classify | nano | | | |
| synthesize | super | | | |
| verdict | ultra | | | |
| **Total** | | | | |

## Caps (placeholders until measured)

| Cap | Value | Rule once measured |
|---|---|---|
| Per run | $0.50 | about 1.5 x measured memo cost |
| Daily live (public demo) | $2.00 | sized so the demo reserve lasts to Dec 15 |
| Global | $40.00 | below the $50 balance |
| Max loops per run | 8 | |

## Plan for the $50

`$50 - dev spend to date - eval runs - demo reserve through Dec 15 = margin`. To be filled with real numbers on Oct 17 and updated Oct 20.
