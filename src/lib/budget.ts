// Budget guard. Nebius Token Factory has no documented spending cap and charges the
// card automatically once the balance goes negative (billing docs, checked 2026-10-15),
// so the cap lives here, in code, and is checked BEFORE every call.
//
// Output tokens are unknown before a call, so the check uses the worst case:
// estimated input tokens + the tier's max_tokens. Actual cost is logged after.

import { CAPS, TIERS, type Tier } from "./config";
import { appendLedger, readLedger, spentUsd, type LedgerEntry } from "./ledger";

export function estimateTokens(text: string): number {
  // Conservative: ~3.5 chars per token, rounded up.
  return Math.ceil(text.length / 3.5);
}

export function costUsd(tier: Tier, inputTokens: number, outputTokens: number): number {
  const t = TIERS[tier];
  return (inputTokens * t.priceInPerM + outputTokens * t.priceOutPerM) / 1_000_000;
}

export function worstCaseUsd(tier: Tier, promptText: string): number {
  return costUsd(tier, estimateTokens(promptText), TIERS[tier].maxTokens);
}

export class BudgetError extends Error {
  constructor(public reason: string) {
    super(reason);
    this.name = "BudgetError";
  }
}

export interface BudgetState {
  runId: string;
  loops: number;
}

export function checkBudget(
  state: BudgetState,
  tier: Tier,
  promptText: string,
  opts: { live: boolean; ledger?: LedgerEntry[] } = { live: true },
): void {
  const entries = opts.ledger ?? readLedger();
  const worst = worstCaseUsd(tier, promptText);
  const today = new Date().toISOString().slice(0, 10);

  const runSpent = spentUsd(entries, (e) => e.runId === state.runId);
  const daySpent = spentUsd(entries, (e) => e.ts.startsWith(today));
  const allSpent = spentUsd(entries);

  const refuse = (reason: string) => {
    appendLedger({ runId: state.runId, kind: "budget", detail: { refused: true, reason, tier, worst } });
    throw new BudgetError(reason);
  };

  if (state.loops >= CAPS.maxLoops) refuse(`max loops reached (${CAPS.maxLoops})`);
  if (runSpent + worst > CAPS.perRunUsd)
    refuse(`per-run cap $${CAPS.perRunUsd} would be exceeded (spent $${runSpent.toFixed(4)}, next call up to $${worst.toFixed(4)})`);
  if (opts.live && daySpent + worst > CAPS.dailyLiveUsd)
    refuse(`daily live cap $${CAPS.dailyLiveUsd} would be exceeded`);
  if (allSpent + worst > CAPS.globalUsd) refuse(`global cap $${CAPS.globalUsd} would be exceeded`);

  state.loops += 1;
}
