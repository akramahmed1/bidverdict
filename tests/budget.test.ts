import { describe, expect, it } from "vitest";
import { costUsd, worstCaseUsd } from "../src/lib/budget";
import { TIERS } from "../src/lib/config";

describe("budget math", () => {
  it("prices Ultra at $1 in / $3 out per million tokens", () => {
    expect(costUsd("ultra", 1_000_000, 0)).toBeCloseTo(1.0);
    expect(costUsd("ultra", 0, 1_000_000)).toBeCloseTo(3.0);
  });

  it("worst case always assumes the full max_tokens output", () => {
    const worst = worstCaseUsd("ultra", "");
    expect(worst).toBeCloseTo((TIERS.ultra.maxTokens * 3.0) / 1_000_000);
  });

  it("Nano is far cheaper than Ultra for the same prompt", () => {
    const p = "x".repeat(10_000);
    expect(worstCaseUsd("nano", p)).toBeLessThan(worstCaseUsd("ultra", p) / 10);
  });
});
