# BidVerdict

**Should a small federal contractor bid on this opportunity?** BidVerdict gives a sourced bid / no-bid memo in minutes. Rules are checked in code first, award history comes from government records, live research comes from Tavily, NVIDIA Nemotron on Nebius Token Factory writes the reasoning, and nothing is final until a human approves it. Every model call, cost and decision goes into a ledger you can replay.

> Status: day 1 of the build (Oct 16, 2026) for the Nebius x NVIDIA Global AI Hackathon, Best Apps and Agents track. Sections below describe only what exists now. Unbuilt features are not claimed.

## What it does

1. **Eligibility gate (code, not a model).** Deadline (timezone-safe), set-aside, NAICS code and place of performance are checked before any model call. If the gate fails, the run stops with plain-language reasons and $0 of model spend.
2. **Award history (USAspending.gov, free, no key).** Who has won similar work from this agency under this NAICS code over the last 5 years, how big the awards were, and how many carried a small-business set-aside.
3. **Live research (Tavily).** The buyer and the requirement, with each result kept as a source.
4. **Nemotron reasoning, by tier.** Nano classifies, Super synthesizes the evidence, Ultra writes only the final verdict.
5. **Source validator (code).** Any claim that cites no source, or cites a URL that is not in this run's evidence, is dropped before a human sees it. The drop is logged.
6. **Human approval.** Approve, reject or send back, logged. *(Oct 19)*
7. **Ledger and replay.** Every call and decision, with tokens, cost and latency. Finished cases replay at $0. *(Oct 20)*

## How NVIDIA Nemotron is used

| Tier | Model (Token Factory) | Job | Price per 1M tokens (in / out) |
|---|---|---|---|
| Nano | Nemotron-3-Nano-30B-A3B | Fast classification, field extraction | $0.06 / $0.24 |
| Super | Nemotron-3-Super-120b-a12b | Research synthesis over sourced evidence | $0.30 / $0.90 |
| Ultra | Nemotron-3-Ultra-550b-a55b | Final bid / no-bid reasoning only | $1.00 / $3.00 |

All tiers are configured in one place: `src/lib/config.ts`.

## How Nebius Token Factory is used

Every model call goes through one client, `src/lib/tokenFactory.ts`, using the OpenAI-compatible endpoint `https://api.tokenfactory.nebius.com/v1`. There is no other LLM provider, not even as a fallback. Each call is checked against the budget **before** it is sent and logged **after** with tokens, cost and latency.

## How Tavily is used

`src/lib/tavily.ts` calls Tavily Search at runtime inside the workflow. Each result becomes a numbered source. The source validator only accepts claim URLs that appear in this run's Tavily or USAspending evidence.

## Budget and caps

Nebius Token Factory has no documented spending cap and charges the card automatically once the balance goes negative, so BidVerdict enforces caps in code (`src/lib/budget.ts`):

- **Per run, daily live, global caps and max loops.** Every call is checked against the worst case (estimated input plus the tier's full `max_tokens`) before it is sent.
- Caps are set from a measured memo (about $0.0095 each). See `BUDGET.md`.

## Run it locally

```bash
npm install
cp .env.example .env      # then add NEBIUS_API_KEY and TAVILY_API_KEY
npm test                  # gate, validator and budget tests (no keys needed)
npm run history           # USAspending award history check (no keys needed)
npm run models            # confirm the Nemotron model IDs your key can use
npm run smoke             # one tiny live call per tier, logged (costs a fraction of a cent)
npm run dev               # http://localhost:3000
```

Without `NEBIUS_API_KEY`, live runs are disabled and the app says so. `BIDVERDICT_MOCK=1` turns on a developer-only fixture client. The UI labels it MOCK.

## Prior work

The USAspending module is ported from the author's earlier public project [`firstwin`](https://github.com/akramahmed1/firstwin), written in the hackathon submission period. It was rewritten in TypeScript and scoped to a single opportunity (agency plus NAICS) for BidVerdict. Everything else here was built new for this hackathon.

## License

MIT. See `LICENSE`.
