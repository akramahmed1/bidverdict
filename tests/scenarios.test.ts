import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import matrix from "../data/eval/scenario-matrix.json";

// Hand-reasoned expectations about the sample companies, checked against the gate's output.
const row = (id: string) => (matrix.rows as any[]).find((r) => r.profile === id)!;
const opps = Object.fromEntries(
  ["70FA3126I00000008","FA8770-26-R-B008-SS","M0026427R0001","36C26027Q0080"].map((id) => [id, JSON.parse(readFileSync(`data/opportunities/${id}.json`, "utf8"))]),
);

describe("sample company scenarios", () => {
  it("a facilities company with no IT NAICS codes passes nothing", () => {
    expect(row("heartland-facilities").results.every((r: any) => !r.pass)).toBe(true);
    expect(row("heartland-facilities").results.every((r: any) => r.failed.includes("naics"))).toBe(true);
  });
  it("a large business fails exactly the set-aside notices and nothing else", () => {
    const failed = row("atlas-federal").results.filter((r: any) => !r.pass);
    expect(failed.length).toBe(3);
    for (const f of failed) {
      expect(f.failed).toEqual(["set_aside"]);
      expect(opps[f.opp] ? opps[f.opp].setAside : "x").not.toBe("NONE");
    }
  });
  it("only the WOSB/EDWOSB firm clears the WOSB set-aside, and only the 8(a) firm clears the 8(a) one", () => {
    const clears = (opp: string) => (matrix.rows as any[]).filter((r) => !r.results.find((x: any) => x.opp === opp).failed.includes("set_aside")).map((r) => r.profile);
    expect(clears("M0026427R0001")).toEqual(["magnolia-analytics"]);
    expect(clears("FA8770-26-R-B008-SS")).toEqual(["lone-star-cyber"]);
  });
});
