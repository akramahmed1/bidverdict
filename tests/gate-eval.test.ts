import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { runGate } from "../src/lib/gate";

const { cases } = JSON.parse(readFileSync("data/eval/gate-cases.json", "utf8"));

describe("gate eval set (deterministic cases, must be 100%)", () => {
  for (const c of cases) {
    it(c.name, () => {
      const r = runGate(c.opportunity, c.profile, new Date(c.now));
      const failed = r.checks.filter((x) => !x.pass).map((x) => x.rule).sort();
      expect(r.pass).toBe(c.expectPass);
      expect(failed).toEqual([...c.expectFailedRules].sort());
    });
  }
});
