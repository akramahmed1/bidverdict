// BidVerdict pipeline. Order matters:
//   1 gate (code)  ->  2 award history (USAspending)  ->  3 Nano classify
//   4 Tavily research  ->  5 Super synthesize claims  ->  6 source validator (code)
//   7 Ultra verdict, fed ONLY validated claims  ->  8 memo awaiting human approval
// If the gate fails, nothing after step 1 runs: $0 model spend.

import { runGate, type CompanyProfile, type GateResult, type Opportunity } from "./gate";
import { awardHistory as realAwardHistory, type AwardHistory } from "./usaspending";
import { tavilySearch as realSearch, type Source } from "./tavily";
import { callTier as realCall, type CallResult, type ChatMessage } from "./tokenFactory";
import { validateClaims, type Claim, type DroppedClaim, type ValidatedClaim } from "./validator";
import { extractJson } from "./json";
import { appendLedger } from "./ledger";
import { spentUsd, readLedger } from "./ledger";
import type { Tier } from "./config";

export interface Deps {
  callTier: (state: { runId: string; loops: number }, tier: Tier, purpose: string, messages: ChatMessage[], opts?: { json?: boolean }) => Promise<CallResult>;
  search: (runId: string, query: string, opts?: { maxResults?: number; startIndex?: number }) => Promise<Source[]>;
  history: (runId: string, agency: string, naics: string) => Promise<AwardHistory>;
  now?: () => Date;
}

export const liveDeps: Deps = { callTier: realCall, search: realSearch, history: realAwardHistory };

export type Verdict = "BID" | "NO_BID" | "CONDITIONAL";

export interface Memo {
  runId: string;
  createdAt: string;
  opportunity: Opportunity;
  profile: CompanyProfile;
  gate: GateResult;
  stoppedAtGate: boolean;
  history?: { total: number; smallBizAwards: number; medianAmount: number | null; topRecipients: AwardHistory["topRecipients"] };
  classification?: { summary: string; queries: string[] };
  sources: Source[];
  supportedClaims: ValidatedClaim[];
  droppedClaims: DroppedClaim[];
  verdict: null | {
    decision: Verdict;
    confidence: "low" | "medium" | "high";
    rationale: { point: string; claimIds: number[] }[];
    risks: string[];
    nextSteps: string[];
  };
  approval: "pending" | "not_applicable";
  cost: { totalUsd: number; byTier: Record<string, { calls: number; inputTokens: number; outputTokens: number; usd: number }> };
  calls: { tier: string; purpose: string; model: string; inputTokens: number; outputTokens: number; usd: number; latencyMs: number }[];
  errors: string[];
}

const j = (o: unknown) => JSON.stringify(o);

export async function runPipeline(
  opp: Opportunity,
  profile: CompanyProfile,
  deps: Deps = liveDeps,
  runId = `run-${new Date().toISOString().replace(/[:.]/g, "-")}`,
): Promise<Memo> {
  const now = deps.now ? deps.now() : new Date();
  const state = { runId, loops: 0 };
  const calls: Memo["calls"] = [];
  const errors: string[] = [];

  const memo: Memo = {
    runId,
    createdAt: now.toISOString(),
    opportunity: opp,
    profile,
    gate: { pass: false, checks: [] },
    stoppedAtGate: false,
    sources: [],
    supportedClaims: [],
    droppedClaims: [],
    verdict: null,
    approval: "pending",
    cost: { totalUsd: 0, byTier: {} },
    calls,
    errors,
  };

  const finish = () => {
    for (const c of calls) {
      const t = (memo.cost.byTier[c.tier] ??= { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0 });
      t.calls++;
      t.inputTokens += c.inputTokens;
      t.outputTokens += c.outputTokens;
      t.usd += c.usd;
      memo.cost.totalUsd += c.usd;
    }
    return memo;
  };

  const model = async (tier: Tier, purpose: string, messages: ChatMessage[]) => {
    state.loops++;
    const r = await deps.callTier(state, tier, purpose, messages, { json: false });
    calls.push({ tier, purpose, model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, usd: r.costUsd, latencyMs: r.latencyMs });
    return r;
  };
  // One retry if the model's reply is not parseable JSON.
  const modelJson = async <T>(tier: Tier, purpose: string, messages: ChatMessage[]): Promise<T | null> => {
    let r = await model(tier, purpose, messages);
    let parsed = extractJson<T>(r.text);
    if (parsed) return parsed;
    r = await model(tier, `${purpose} (retry: reply was not valid JSON)`, [
      ...messages,
      { role: "user", content: "Your last reply was not valid JSON. Reply again with ONLY the JSON object, nothing else." },
    ]);
    parsed = extractJson<T>(r.text);
    return parsed;
  };

  // 1. Gate (code)
  memo.gate = runGate(opp, profile, now);
  appendLedger({ runId, kind: "gate", detail: { pass: memo.gate.pass, checks: memo.gate.checks } });
  if (!memo.gate.pass) {
    memo.stoppedAtGate = true;
    memo.approval = "not_applicable";
    return finish();
  }

  try {
    // 2. Award history
    const hist = await deps.history(runId, opp.agency, opp.naics);
    memo.history = { total: hist.total, smallBizAwards: hist.smallBizAwards, medianAmount: hist.medianAmount, topRecipients: hist.topRecipients };
    const awardSources: Source[] = hist.awards.slice(0, 5).filter((a) => a.url).map((a, i) => ({
      id: `A${i + 1}`,
      title: `USAspending award ${a.awardId}: ${a.recipient}, $${Math.round(a.amount).toLocaleString("en-US")}`,
      url: a.url,
      snippet: `${a.date} | ${a.agency}${a.subAgency ? " / " + a.subAgency : ""} | ${a.description}`.slice(0, 400),
      query: "usaspending",
    }));

    // 3. Nano: classify the requirement and propose research queries
    const cls = await modelJson<{ summary: string; queries: string[] }>("nano", "classify requirement", [
      { role: "system", content: "You extract facts from federal contract opportunities. Reply with ONLY a JSON object." },
      {
        role: "user",
        content: `Opportunity:\nTitle: ${opp.title}\nAgency: ${opp.agency}\nNAICS: ${opp.naics}\nDescription: ${opp.description}\n\nReturn JSON: {"summary": "one sentence on what the buyer needs", "queries": ["3 short web search queries to research the buyer, the incumbent and similar recent awards"]}`,
      },
    ]);
    if (!cls?.queries?.length) throw new Error("Nano did not return usable research queries.");
    memo.classification = { summary: String(cls.summary ?? ""), queries: cls.queries.slice(0, 3).map(String) };

    // 4. Tavily research
    const tavily: Source[] = [];
    for (const q of memo.classification.queries) {
      try {
        const found = await deps.search(runId, q, { maxResults: 4, startIndex: tavily.length + 1 });
        for (const s of found) if (!tavily.some((t) => t.url === s.url)) tavily.push(s);
      } catch (e) {
        errors.push(`search "${q}": ${(e as Error).message}`);
      }
    }
    memo.sources = [...awardSources, ...tavily];
    if (memo.sources.length === 0) throw new Error("No evidence found; refusing to produce a verdict without sources.");

    // 5. Super: synthesize claims, each tied to evidence URLs
    const evidenceText = memo.sources.map((s) => `[${s.id}] ${s.title}\nURL: ${s.url}\n${s.snippet}`).join("\n\n");
    const histText = `Award history (USAspending, last ${hist.years} yrs, ${opp.agency}, NAICS ${opp.naics}): ${hist.total} contract awards, ${hist.smallBizAwards} with a small-business set-aside; median of top awards $${hist.medianAmount ?? "n/a"}.`;
    const syn = await modelJson<{ claims: Claim[] }>("super", "synthesize sourced claims", [
      {
        role: "system",
        content:
          "You are a federal contracting analyst. Use ONLY the evidence provided. Every claim must cite one or more URLs copied exactly from the evidence. Never cite a URL that is not in the evidence. Reply with ONLY a JSON object.",
      },
      {
        role: "user",
        content: `Company: ${j(profile)}\nOpportunity: ${opp.title} (${opp.agency}, NAICS ${opp.naics}, set-aside ${opp.setAside})\nRequirement summary: ${memo.classification.summary}\n${histText}\n\nEVIDENCE:\n${evidenceText}\n\nReturn JSON: {"claims":[{"text":"one specific, checkable statement relevant to bid/no-bid","kind":"fit|risk|fact","sourceUrls":["exact URL from evidence"]}]} with 5 to 8 claims.`,
      },
    ]);
    const claims = (syn?.claims ?? []).filter((c) => c && typeof c.text === "string");
    if (!claims.length) throw new Error("Super did not return usable claims.");

    // 6. Source validator (code)
    const evidenceUrls = memo.sources.map((s) => s.url);
    const { supported, dropped } = validateClaims(runId, claims, evidenceUrls);
    memo.supportedClaims = supported;
    memo.droppedClaims = dropped;
    if (!supported.length) throw new Error("Every claim failed source validation; no verdict produced.");

    // 7. Ultra: final verdict from validated claims only
    const claimList = supported.map((c, i) => `#${i + 1} [${c.kind}] ${c.text}`).join("\n");
    const ver = await modelJson<{ decision: Verdict; confidence: "low" | "medium" | "high"; rationale: { point: string; claimIds: number[] }[]; risks: string[]; nextSteps: string[] }>(
      "ultra",
      "final bid/no-bid verdict",
      [
        {
          role: "system",
          content:
            "You give a bid/no-bid recommendation for a small federal contractor. Reason ONLY from the numbered, source-verified claims and the company profile. Do not introduce new facts. Reply with ONLY a JSON object.",
        },
        {
          role: "user",
          content: `Company: ${j(profile)}\nOpportunity: ${opp.title} (${opp.agency}, NAICS ${opp.naics}, set-aside ${opp.setAside}, due ${opp.responseDeadline})\nEligibility gate: PASSED (${memo.gate.checks.map((c) => c.rule).join(", ")}).\n${histText}\n\nVERIFIED CLAIMS:\n${claimList}\n\nReturn JSON: {"decision":"BID|NO_BID|CONDITIONAL","confidence":"low|medium|high","rationale":[{"point":"reason","claimIds":[1,2]}],"risks":["..."],"nextSteps":["..."]}. Each rationale point must reference claim numbers above.`,
        },
      ],
    );
    if (!ver || !["BID", "NO_BID", "CONDITIONAL"].includes(ver.decision)) throw new Error("Ultra did not return a valid verdict.");
    // Code check: rationale may only cite claim numbers that exist.
    const max = supported.length;
    ver.rationale = (ver.rationale ?? []).map((r) => ({ point: String(r.point), claimIds: (r.claimIds ?? []).filter((n) => Number.isInteger(n) && n >= 1 && n <= max) }));
    memo.verdict = { decision: ver.decision, confidence: ver.confidence ?? "low", rationale: ver.rationale, risks: (ver.risks ?? []).map(String), nextSteps: (ver.nextSteps ?? []).map(String) };
  } catch (e) {
    errors.push((e as Error).message);
  }

  appendLedger({ runId, kind: "approval", detail: { status: "pending", verdict: memo.verdict?.decision ?? null, errors } });
  return finish();
}

export function runCostFromLedger(runId: string): number {
  return spentUsd(readLedger(), (e) => e.runId === runId);
}
