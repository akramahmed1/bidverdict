import { describe, it, expect } from "vitest";
import { runGate, type CompanyProfile, type Opportunity } from "../src/lib/gate";

const profile: CompanyProfile = { name: "T", naics: ["541512"], certifications: [], placesOfPerformance: ["IL"], pastPerformance: "", capacityNotes: "" };
const opp: Opportunity = { id: "1", title: "t", agency: "a", naics: "541512", setAside: "NONE", responseDeadline: "2030-01-01T00:00:00-05:00", placeOfPerformance: "UNSPECIFIED", description: "d" };

describe("gate: place of performance", () => {
  it("passes with a verify-before-bidding note when the notice states no place", () => {
    const r = runGate(opp, profile, new Date("2026-10-16T00:00:00Z"));
    const c = r.checks.find((x) => x.rule === "place_of_performance")!;
    expect(c.pass).toBe(true);
    expect(c.reason).toContain("not stated");
  });
  it("still blocks a stated place outside coverage", () => {
    const r = runGate({ ...opp, placeOfPerformance: "TX" }, profile, new Date("2026-10-16T00:00:00Z"));
    expect(r.pass).toBe(false);
  });
  it("a company with no NAICS codes is blocked on every opportunity", () => {
    const r = runGate(opp, { ...profile, naics: [] }, new Date("2026-10-16T00:00:00Z"));
    expect(r.checks.find((x) => x.rule === "naics")!.pass).toBe(false);
  });
});
