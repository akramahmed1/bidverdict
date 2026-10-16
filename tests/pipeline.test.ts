import { describe, it, expect } from "vitest";
import { runPipeline, type Deps } from "../src/lib/pipeline";
import type { CompanyProfile, Opportunity } from "../src/lib/gate";

const profile: CompanyProfile = { name: "T", naics: ["541512"], certifications: ["SBA"], placesOfPerformance: ["IL"], pastPerformance: "", capacityNotes: "" };
const opp: Opportunity = { id: "1", title: "t", agency: "Department of Veterans Affairs", naics: "541512", setAside: "SBA", responseDeadline: "2030-01-01T00:00:00-05:00", placeOfPerformance: "IL", description: "d" };
const now = () => new Date("2026-10-16T00:00:00Z");

function fakeDeps(replies: Record<string, string>, log: string[]): Deps {
  return {
    now,
    callTier: async (_s, tier, purpose) => {
      log.push(tier);
      return { text: tier === "nano" && purpose.startsWith("relevance") ? (replies.relevance ?? '{"checks":[]}') : replies[tier], model: "fake", inputTokens: 100, outputTokens: 50, costUsd: 0.001, latencyMs: 1, mock: false };
    },
    search: async (_r, q, o) => [{ id: `S${o?.startIndex ?? 1}`, title: "T", url: "https://example.gov/a", snippet: "s", query: q }],
    history: async () => ({ agency: "a", naics: "n", years: 5, total: 10, awards: [], smallBizAwards: 4, medianAmount: 1000, topRecipients: [] }),
  };
}

describe("pipeline", () => {
  it("stops at the gate with zero model calls", async () => {
    const log: string[] = [];
    const memo = await runPipeline({ ...opp, setAside: "8A" }, profile, fakeDeps({}, log), "t1");
    expect(memo.stoppedAtGate).toBe(true);
    expect(log).toEqual([]);
    expect(memo.cost.totalUsd).toBe(0);
    expect(memo.approval).toBe("not_applicable");
  });

  it("drops claims citing URLs not in evidence and feeds Ultra only supported claims", async () => {
    const log: string[] = [];
    const prompts: string[] = [];
    const deps = fakeDeps(
      {
        nano: '<think>x</think>{"summary":"s","queries":["q1"]}',
        super: JSON.stringify({ claims: [
          { text: "good", kind: "fact", sourceUrls: ["https://example.gov/a"] },
          { text: "invented", kind: "fact", sourceUrls: ["https://made-up.example/x"] },
        ] }),
        ultra: '```json\n{"decision":"CONDITIONAL","confidence":"medium","rationale":[{"point":"p","claimIds":[1,9]}],"risks":["r"],"nextSteps":["n"]}\n```',
      },
      log,
    );
    const orig = deps.callTier;
    deps.callTier = async (s, t, p, m, o) => { prompts.push(m.map((x) => x.content).join("\n")); return orig(s, t, p, m, o); };
    const memo = await runPipeline(opp, profile, deps, "t2");
    expect(memo.supportedClaims).toHaveLength(1);
    expect(memo.droppedClaims).toHaveLength(1);
    expect(prompts[prompts.length - 1]).not.toContain("invented");
    expect(memo.verdict?.decision).toBe("CONDITIONAL");
    expect(memo.verdict?.rationale[0].claimIds).toEqual([1]);
    expect(log).toEqual(["nano", "super", "nano", "ultra"]);
  });

  it("drops claims the relevance check marks irrelevant or unsupported", async () => {
    const log: string[] = [];
    const memo = await runPipeline(opp, profile, fakeDeps({
      nano: '{"summary":"s","queries":["q"]}',
      super: JSON.stringify({ claims: [
        { text: "keep", kind: "fact", sourceUrls: ["https://example.gov/a"] },
        { text: "irrelevant", kind: "fact", sourceUrls: ["https://example.gov/a"] },
        { text: "unsupported", kind: "fact", sourceUrls: ["https://example.gov/a"] },
      ] }),
      relevance: JSON.stringify({ checks: [
        { n: 1, supported: "yes", relevant: "yes", reason: "" },
        { n: 2, supported: "yes", relevant: "no", reason: "other site" },
        { n: 3, supported: "no", relevant: "yes", reason: "not in text" },
      ] }),
      ultra: '{"decision":"BID","confidence":"low","rationale":[{"point":"p","claimIds":[1]}],"risks":[],"nextSteps":[]}',
    }, log), "t4");
    expect(memo.supportedClaims.map((c) => c.text)).toEqual(["keep"]);
    expect(memo.droppedClaims.map((c) => c.text).sort()).toEqual(["irrelevant", "unsupported"]);
    expect(memo.droppedClaims.every((c) => c.reason.startsWith("relevance check"))).toBe(true);
  });

  it("produces no verdict when every claim fails validation", async () => {
    const log: string[] = [];
    const memo = await runPipeline(opp, profile, fakeDeps({
      nano: '{"summary":"s","queries":["q"]}',
      super: JSON.stringify({ claims: [{ text: "x", kind: "fact", sourceUrls: ["https://nope.example"] }] }),
      ultra: "{}",
    }, log), "t3");
    expect(memo.verdict).toBeNull();
    expect(log).not.toContain("ultra");
    expect(memo.errors.length).toBeGreaterThan(0);
  });
});
