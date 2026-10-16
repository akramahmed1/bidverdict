// Gate tests are code tests: they must pass 100%. A failure is a bug, not tuning.
import { describe, expect, it } from "vitest";
import { runGate, type CompanyProfile, type Opportunity } from "../src/lib/gate";

const NOW = new Date("2026-10-20T12:00:00-05:00");

const profile: CompanyProfile = {
  name: "Sample Co",
  naics: ["541512", "541519"],
  certifications: ["SBA", "SDVOSB"],
  placesOfPerformance: ["IL", "WI", "IN"],
  pastPerformance: "Two IT support subcontracts for VA medical centers.",
  capacityNotes: "12 staff; can surge to 18.",
};

const base: Opportunity = {
  id: "T-1",
  title: "IT help desk support",
  agency: "Department of Veterans Affairs",
  naics: "541512",
  setAside: "SDVOSB",
  responseDeadline: "2026-11-05T14:00:00-05:00",
  placeOfPerformance: "IL",
  description: "Tier 1/2 help desk.",
};

const fail = (o: Partial<Opportunity>) => runGate({ ...base, ...o }, profile, NOW);
const failed = (o: Partial<Opportunity>) => fail(o).checks.filter((c) => !c.pass).map((c) => c.rule);

describe("eligibility gate", () => {
  it("passes a clean opportunity", () => {
    expect(runGate(base, profile, NOW).pass).toBe(true);
  });

  it("rejects an expired deadline", () => {
    expect(failed({ responseDeadline: "2026-10-01T14:00:00-05:00" })).toEqual(["deadline"]);
  });

  it("compares deadlines across timezones correctly", () => {
    // 12:30 Eastern = 11:30 Central, which is BEFORE NOW (12:00 Central): closed.
    expect(failed({ responseDeadline: "2026-10-20T12:30:00-04:00" })).toEqual(["deadline"]);
    // 13:30 Eastern = 12:30 Central, AFTER NOW: open.
    expect(fail({ responseDeadline: "2026-10-20T13:30:00-04:00" }).pass).toBe(true);
  });

  it("refuses a deadline without a timezone offset", () => {
    expect(failed({ responseDeadline: "2026-11-05T14:00:00" })).toEqual(["deadline"]);
  });

  it("rejects a set-aside the company does not hold", () => {
    expect(failed({ setAside: "8A" })).toEqual(["set_aside"]);
  });

  it("accepts full and open competition", () => {
    expect(fail({ setAside: "NONE" }).pass).toBe(true);
  });

  it("rejects a NAICS code outside the profile", () => {
    expect(failed({ naics: "236220" })).toEqual(["naics"]);
  });

  it("rejects a place of performance outside coverage", () => {
    expect(failed({ placeOfPerformance: "CA" })).toEqual(["place_of_performance"]);
  });

  it("accepts remote work regardless of coverage", () => {
    expect(fail({ placeOfPerformance: "REMOTE" }).pass).toBe(true);
  });

  it("reports every failing rule, not just the first", () => {
    expect(failed({ naics: "236220", placeOfPerformance: "CA", setAside: "8A" })).toEqual([
      "set_aside",
      "naics",
      "place_of_performance",
    ]);
  });
});
