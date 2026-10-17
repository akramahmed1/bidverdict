// Small presentation helpers shared by pages. No data logic here.
export type Decision = "BID" | "NO_BID" | "CONDITIONAL" | "INSUFFICIENT_EVIDENCE";

export const VERDICT: Record<Decision, { label: string; short: string; cls: string; sentence: string }> = {
  BID: { label: "Bid", short: "B", cls: "v-bid", sentence: "Worth pursuing." },
  CONDITIONAL: { label: "Conditional", short: "C", cls: "v-cond", sentence: "Bid only if the open questions resolve in your favor." },
  NO_BID: { label: "No-bid", short: "N", cls: "v-no", sentence: "Not worth pursuing." },
  INSUFFICIENT_EVIDENCE: { label: "No call", short: "?", cls: "v-none", sentence: "Not enough verified evidence to recommend anything." },
};

export const RULE_LABEL: Record<string, { name: string; letter: string }> = {
  deadline: { name: "Deadline", letter: "D" },
  set_aside: { name: "Set-aside", letter: "S" },
  naics: { name: "NAICS", letter: "N" },
  place_of_performance: { name: "Place", letter: "P" },
};

export const usd = (n: number, digits = 4) => `$${n.toFixed(digits)}`;

export const shortDate = (iso: string) =>
  new Date(iso.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export const CERT_LABEL: Record<string, string> = {
  SBA: "Small business", "8A": "8(a)", HUBZONE: "HUBZone", WOSB: "WOSB", EDWOSB: "EDWOSB", SDVOSB: "SDVOSB", NONE: "Full and open",
};
