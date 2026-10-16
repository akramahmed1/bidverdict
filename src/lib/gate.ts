// Deterministic eligibility gate. Pure code, no LLM. Runs before any model call
// and fails closed: if it fails, the run stops with plain-language reasons and
// zero model spend. The model cannot talk its way past an ineligible opportunity.

export type SetAside =
  | "NONE" // full and open
  | "SBA" // total small business
  | "8A"
  | "HUBZONE"
  | "WOSB"
  | "EDWOSB"
  | "SDVOSB";

export interface CompanyProfile {
  name: string;
  naics: string[]; // 6-digit codes
  certifications: SetAside[]; // set-asides the company qualifies for
  placesOfPerformance: string[]; // 2-letter state codes, or "REMOTE" / "ANY"
  pastPerformance: string;
  capacityNotes: string;
}

export interface Opportunity {
  id: string;
  title: string;
  agency: string;
  subAgency?: string; // awarding sub-tier, used to narrow award history
  noticeType?: string;
  naics: string;
  setAside: SetAside;
  responseDeadline: string; // ISO 8601 WITH offset, e.g. 2026-10-30T14:00:00-04:00
  placeOfPerformance: string; // 2-letter state code, or "REMOTE"
  description: string;
  sourceUrl?: string;
}

export interface GateCheck {
  rule: "deadline" | "set_aside" | "naics" | "place_of_performance";
  pass: boolean;
  reason: string;
}

export interface GateResult {
  pass: boolean;
  checks: GateCheck[];
}

// EDWOSB firms also qualify for WOSB set-asides.
const QUALIFIES: Record<SetAside, SetAside[]> = {
  NONE: [],
  SBA: ["SBA"],
  "8A": ["8A"],
  HUBZONE: ["HUBZONE"],
  WOSB: ["WOSB", "EDWOSB"],
  EDWOSB: ["EDWOSB"],
  SDVOSB: ["SDVOSB"],
};

export function parseDeadline(iso: string): Date {
  // Require an explicit offset or Z so an off-by-hours timezone bug cannot slip in.
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(iso)) {
    throw new Error(`Deadline "${iso}" has no timezone offset; refusing to guess.`);
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Deadline "${iso}" is not a valid date.`);
  return d;
}

export function runGate(opp: Opportunity, profile: CompanyProfile, now: Date = new Date()): GateResult {
  const checks: GateCheck[] = [];

  // 1. Deadline
  let deadline: Date | null = null;
  try {
    deadline = parseDeadline(opp.responseDeadline);
  } catch (e) {
    checks.push({ rule: "deadline", pass: false, reason: (e as Error).message });
  }
  if (deadline) {
    const open = deadline.getTime() > now.getTime();
    checks.push({
      rule: "deadline",
      pass: open,
      reason: open
        ? `Responses due ${opp.responseDeadline}; still open.`
        : `Response deadline ${opp.responseDeadline} has passed.`,
    });
  }

  // 2. Set-aside
  if (opp.setAside === "NONE") {
    checks.push({ rule: "set_aside", pass: true, reason: "Full and open competition; no set-aside required." });
  } else {
    const ok = profile.certifications.some((c) => QUALIFIES[opp.setAside].includes(c));
    checks.push({
      rule: "set_aside",
      pass: ok,
      reason: ok
        ? `Set-aside ${opp.setAside} matches the company's certifications.`
        : `Set-aside ${opp.setAside} requires a certification the company does not hold (holds: ${profile.certifications.join(", ") || "none"}).`,
    });
  }

  // 3. NAICS
  const naicsOk = profile.naics.includes(opp.naics);
  checks.push({
    rule: "naics",
    pass: naicsOk,
    reason: naicsOk
      ? `NAICS ${opp.naics} is in the company's codes.`
      : `NAICS ${opp.naics} is not in the company's codes (${profile.naics.join(", ")}).`,
  });

  // 4. Place of performance
  const pops = profile.placesOfPerformance.map((p) => p.toUpperCase());
  const pop = opp.placeOfPerformance.toUpperCase();
  const unspecified = pop === "UNSPECIFIED";
  const popOk = pops.includes("ANY") || pops.includes(pop) || pop === "REMOTE" || unspecified;
  checks.push({
    rule: "place_of_performance",
    pass: popOk,
    reason: unspecified
      ? "Place of performance is not stated in the notice; verify before bidding."
      : popOk
      ? `Place of performance ${pop} is within the company's coverage.`
      : `Place of performance ${pop} is outside the company's coverage (${pops.join(", ")}).`,
  });

  return { pass: checks.every((c) => c.pass), checks };
}
