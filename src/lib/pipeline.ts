// BidVerdict pipeline. Order matters:
//   1 gate (code)  ->  2 award history (USAspending)  ->  3 Nano classify
//   4 Tavily research  ->  5 Super synthesize claims  ->  6 source validator (code)
//   7 Ultra verdict, fed ONLY validated claims  ->  8 memo awaiting human approval
// If the gate fails, nothing after step 1 runs: $0 model spend.

import { runGate, type CompanyProfile, type GateResult, type Opportunity } from "./gate";
import { awardHistory as realAwardHistory, type AwardHistory } from "./usaspending";
import { tavilySearch as realSearch, type Source } from "./tavily";
import { callTier as realCall, type CallResult, type ChatMessage } from "./tokenFactory";
import { normalizeUrl, validateClaims, type Claim, type DroppedClaim, type ValidatedClaim } from "./validator";
import { extractJson } from "./json";
import { appendLedger } from "./ledger";
import { spentUsd, readLedger } from "./ledger";
import type { Tier } from "./config";

export interface Deps {
  callTier: (state: { runId: string; loops: number }, tier: Tier, purpose: string, messages: ChatMessage[], opts?: { json?: boolean }) => Promise<CallResult>;
  search: (runId: string, query: string, opts?: { maxResults?: number; startIndex?: number }) => Promise<Source[]>;
  history: (runId: string, agency: string, naics: string, opts?: { subtier?: string }) => Promise<AwardHistory>;
  now?: () => Date;
}

export const liveDeps: Deps = { callTier: realCall, search: realSearch, history: realAwardHistory };

export type Verdict = "BID" | "NO_BID" | "CONDITIONAL" | "INSUFFICIENT_EVIDENCE";

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

// Progress events for the live view. Purely informational; the pipeline never depends on them.
export type Step = "gate" | "history" | "classify" | "research" | "claims" | "validate" | "verdict" | "done";

export async function runPipeline(
  opp: Opportunity,
  profile: CompanyProfile,
  deps: Deps = liveDeps,
  runId = `run-${new Date().toISOString().replace(/[:.]/g, "-")}`,
  onProgress: (step: Step, message: string) => void = () => {},
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
    // loop counting happens in checkBudget (one increment per live model call)
    const r = await deps.callTier(state, tier, purpose, messages, { json: false });
    calls.push({ tier, purpose, model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, usd: r.costUsd, latencyMs: r.latencyMs });
    return r;
  };
  // One retry if the model's reply is not parseable JSON.
  const modelJson = async <T>(tier: Tier, purpose: string, messages: ChatMessage[]): Promise<T | null> => {
    let r = await model(tier, purpose, messages);
    let parsed = extractJson<T>(r.text);
    if (parsed) return parsed;
    appendLedger({ runId, kind: "tool_call", detail: { tool: "json_parse_failed", tier, purpose, replyStart: r.text.slice(0, 300), replyEnd: r.text.slice(-200) } });
    r = await model(tier, `${purpose} (retry: reply was not valid JSON)`, [
      ...messages,
      { role: "user", content: "Your last reply was not valid JSON. Reply again with ONLY the JSON object, nothing else." },
    ]);
    parsed = extractJson<T>(r.text);
    return parsed;
  };

  // 1. Gate (code)
  onProgress("gate", "Checking deadline, set-aside, NAICS and place in code");
  memo.gate = runGate(opp, profile, now);
  appendLedger({ runId, kind: "gate", detail: { pass: memo.gate.pass, checks: memo.gate.checks } });
  if (!memo.gate.pass) {
    memo.stoppedAtGate = true;
    memo.approval = "not_applicable";
    return finish();
  }

  try {
    // 2. Award history
    onProgress("history", "Pulling five years of award history from USAspending");
    let hist = await deps.history(runId, opp.agency, opp.naics, opp.subAgency ? { subtier: opp.subAgency } : undefined);
    if (opp.subAgency && hist.total === 0) {
      errors.push(`No USAspending awards for sub-tier "${opp.subAgency}"; fell back to agency-level history.`);
      hist = await deps.history(runId, opp.agency, opp.naics);
    }
    memo.history = { total: hist.total, smallBizAwards: hist.smallBizAwards, medianAmount: hist.medianAmount, topRecipients: hist.topRecipients };
    const awardSources: Source[] = hist.awards.slice(0, 5).filter((a) => a.url).map((a, i) => ({
      id: `A${i + 1}`,
      title: `USAspending award ${a.awardId}: ${a.recipient}, $${Math.round(a.amount).toLocaleString("en-US")}`,
      url: a.url,
      snippet: `${a.date} | ${a.agency}${a.subAgency ? " / " + a.subAgency : ""} | ${a.description}`.slice(0, 400),
      query: "usaspending",
    }));

    // 3. Nano: classify
    onProgress("classify", "Nemotron Nano is reading the requirement");
    // (classify) the requirement and propose research queries
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
    onProgress("research", "Searching the web with Tavily");
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

    // 5. Super: synthesize
    onProgress("claims", `Nemotron Super is drafting claims from ${memo.sources.length} sources`);
    // (synthesize) claims, each tied to evidence URLs
    const evidenceText = memo.sources.map((s) => `[${s.id}] ${s.title}\nURL: ${s.url}\n${s.snippet}`).join("\n\n");
    const histText = `Award history (USAspending, last ${hist.years} yrs, ${opp.agency}, NAICS ${opp.naics}): ${hist.total} contract awards, ${hist.smallBizAwards} with a small-business set-aside; median of top awards $${hist.medianAmount ?? "n/a"}.`;
    const syn = await modelJson<{ claims: Claim[] }>("super", "synthesize sourced claims", [
      {
        role: "system",
        content:
          "You are a federal contracting analyst. Use ONLY the evidence provided. Every claim must cite one or more URLs copied exactly from the evidence. Never cite a URL that is not in the evidence. Claims must be about the buyer, the requirement, competitors or award history, as stated in the evidence. Do NOT make claims about the company being evaluated: the company profile is given only for context, and judging fit is a later step. Reply with ONLY a JSON object.",
      },
      {
        role: "user",
        content: `Company: ${j(profile)}\nOpportunity: ${opp.title} (${opp.agency}, NAICS ${opp.naics}, set-aside ${opp.setAside}, notice type ${opp.noticeType ?? "unspecified"}, place ${opp.placeOfPerformance})\nRequirement summary: ${memo.classification.summary}\n${histText}\n\nEVIDENCE:\n${evidenceText}\n\nReturn JSON: {"claims":[{"text":"one specific, checkable statement relevant to bid/no-bid","kind":"fit|risk|fact","sourceUrls":["exact URL from evidence"]}]} with 4 to 6 claims, each ONE short sentence. Keep your reasoning brief.`,
      },
    ]);
    const claims = (syn?.claims ?? []).filter((c) => c && typeof c.text === "string");
    if (!claims.length) throw new Error("Super did not return usable claims.");

    // 6. Source validator (code)
    onProgress("validate", "Dropping any claim whose source is missing, unsupported or off-topic");
    const evidenceUrls = memo.sources.map((s) => s.url);
    const { supported, dropped } = validateClaims(runId, claims, evidenceUrls);
    memo.droppedClaims = dropped;

    // 6b. Relevance check (Nano): does the cited source text actually support the claim,
    // and does the claim matter for THIS opportunity? One batched call.
    let kept = supported;
    if (supported.length) {
      const byUrl = new Map(memo.sources.map((s) => [normalizeUrl(s.url), s]));
      const items = supported.map((c, i) => ({
        n: i + 1,
        claim: c.text,
        sourceText: c.sourceUrls.map((u) => { const src = byUrl.get(normalizeUrl(u)); return src ? `${src.title}. ${src.snippet}` : ""; }).join(" | ").slice(0, 1400),
      }));
      type Rel = { checks: { n: number; supported: "yes" | "partial" | "no"; relevant: "yes" | "no"; reason: string }[] };
      const relMessages: ChatMessage[] = [
          { role: "system", content: "You audit claims. Judge only from the source text given. Reply with ONLY a JSON object." },
          {
            role: "user",
            content: `Opportunity: ${opp.title} (${opp.agency}, NAICS ${opp.naics}, place of performance ${opp.placeOfPerformance}). Requirement: ${memo.classification.summary}\n\nFor each item say whether the source text supports the claim (yes/partial/no) and whether the claim is relevant to a bid/no-bid decision on THIS opportunity (yes/no; a true fact about an unrelated place, program or time is "no").\n\n${JSON.stringify(items)}\n\nReturn JSON: {"checks":[{"n":1,"supported":"yes|partial|no","relevant":"yes|no","reason":"short"}]}`,
          },
      ];
      let rel = await modelJson<Rel>("nano", "relevance and support check", relMessages);
      if (!rel?.checks) {
        // Escalate once to the Super tier rather than skipping the check.
        rel = await modelJson<Rel>("super", "relevance and support check (escalated from nano)", relMessages);
      }
      if (!rel?.checks) {
        throw new Error("Relevance check failed on both Nano and Super; refusing to show unchecked claims.");
      } else {
        const verdictByN = new Map(rel.checks.map((c) => [c.n, c]));
        kept = [];
        supported.forEach((c, i) => {
          const r = verdictByN.get(i + 1);
          if (r && (r.supported === "no" || r.relevant === "no")) {
            const reason = `relevance check: ${r.supported === "no" ? "source does not support claim" : "not relevant to this opportunity"}${r.reason ? " (" + r.reason + ")" : ""}`;
            memo.droppedClaims.push({ ...c, status: "dropped", reason });
            appendLedger({ runId, kind: "validator_drop", detail: { claim: c.text, reason } });
          } else kept.push(c);
        });
      }
    }
    memo.supportedClaims = kept;
    if (!kept.length) {
      // Refuse to guess: no verified, relevant claim survived, so Ultra is never called ($0 for the verdict step).
      memo.verdict = {
        decision: "INSUFFICIENT_EVIDENCE",
        confidence: "low",
        rationale: [{ point: "Every claim the research produced was unsourced, unsupported by its source, or not relevant to this opportunity, so no recommendation is made.", claimIds: [] }],
        risks: ["A bid decision made without verified evidence would be a guess."],
        nextSteps: ["Read the full solicitation and its attachments on SAM.gov.", "Ask the contracting officer the open questions in the notice.", "Run again after the buyer publishes more detail."],
      };
      appendLedger({ runId, kind: "approval", detail: { status: "pending", verdict: "INSUFFICIENT_EVIDENCE", errors } });
      return finish();
    }

    // 7. Ultra: final verdict
    onProgress("verdict", `Nemotron Ultra is weighing ${kept.length} verified claims`);
    // (verdict) from validated claims only
    const claimList = kept.map((c, i) => `#${i + 1} [${c.kind}] ${c.text}`).join("\n");
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
    const max = kept.length;
    ver.rationale = (ver.rationale ?? []).map((r) => ({ point: String(r.point), claimIds: (r.claimIds ?? []).filter((n) => Number.isInteger(n) && n >= 1 && n <= max) }));
    memo.verdict = { decision: ver.decision, confidence: ver.confidence ?? "low", rationale: ver.rationale, risks: (ver.risks ?? []).map(String), nextSteps: (ver.nextSteps ?? []).map(String) };
  } catch (e) {
    errors.push((e as Error).message);
  }

  appendLedger({ runId, kind: "approval", detail: { status: "pending", verdict: memo.verdict?.decision ?? null, errors } });
  onProgress("done", memo.verdict ? "Memo ready" : "Finished without a verdict");
  return finish();
}

export function runCostFromLedger(runId: string): number {
  return spentUsd(readLedger(), (e) => e.runId === runId);
}
