import { describe, it, expect } from "vitest";
import { agreement, gateScore } from "../src/lib/evalScores";

describe("eval scores", () => {
  it("gate score is 100%", () => {
    const g = gateScore();
    expect(g.correct).toBe(g.total);
  });
  it("counts exact matches and direct reversals, ignores cases without a verdict", () => {
    const memos: any = { a: { verdict: { decision: "BID" } }, b: { verdict: { decision: "NO_BID" } }, c: { verdict: { decision: "CONDITIONAL" } }, d: null };
    const labels: any = { labeler: "x", labels: { a: { label: "BID" }, b: { label: "BID" }, c: { label: "NO_BID" }, d: { label: "BID" } } };
    const r = agreement(labels, memos);
    expect(r.n).toBe(3);
    expect(r.exact).toBe(1);
    expect(r.flips).toBe(1);
  });
});
