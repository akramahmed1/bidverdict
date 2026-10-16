import { describe, expect, it } from "vitest";
import { validateClaims, type Claim } from "../src/lib/validator";

const evidence = [
  "https://www.va.gov/opal/nac/",
  "https://www.usaspending.gov/award/CONT_AWD_36C25025P0001_3600_-NONE-_-NONE-",
];

const run = (claims: Claim[]) => validateClaims("test", claims, evidence, { log: false });

describe("source validator", () => {
  it("keeps a claim whose URL is in this run's evidence", () => {
    const r = run([{ text: "VA buys this often.", kind: "fact", sourceUrls: ["https://www.va.gov/opal/nac/"] }]);
    expect(r.supported).toHaveLength(1);
    expect(r.dropped).toHaveLength(0);
  });

  it("drops a claim with no source", () => {
    const r = run([{ text: "Incumbent is weak.", kind: "fit", sourceUrls: [] }]);
    expect(r.dropped[0].reason).toBe("no source attached");
  });

  it("drops a claim citing a plausible but invented URL", () => {
    const r = run([{ text: "Budget doubled.", kind: "fact", sourceUrls: ["https://www.va.gov/budget-2027-it-expansion"] }]);
    expect(r.supported).toHaveLength(0);
    expect(r.dropped[0].reason).toMatch(/not in this run's evidence/);
  });

  it("treats trailing slash, fragment and tracking params as the same URL", () => {
    const r = run([{ text: "x", kind: "fact", sourceUrls: ["https://WWW.va.gov/opal/nac?utm_source=x#top"] }]);
    expect(r.supported).toHaveLength(1);
  });

  it("drops a claim if ANY cited URL is unknown", () => {
    const r = run([{ text: "x", kind: "risk", sourceUrls: [evidence[0], "https://made-up.example.com"] }]);
    expect(r.dropped).toHaveLength(1);
  });

  it("splits a mixed memo correctly", () => {
    const r = run([
      { text: "sourced", kind: "fit", sourceUrls: [evidence[1]] },
      { text: "unsourced", kind: "risk", sourceUrls: [] },
    ]);
    expect(r.supported.map((c) => c.text)).toEqual(["sourced"]);
    expect(r.dropped.map((c) => c.text)).toEqual(["unsourced"]);
  });
});
