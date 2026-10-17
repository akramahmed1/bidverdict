// Plain-markdown export of a saved memo, so a verdict can be forwarded to a team or attached to a capture file.
import type { Memo } from "./pipeline";
import { CERT_LABEL, VERDICT, type Decision } from "./ui";

export function memoToMarkdown(memo: Memo): string {
  const o = memo.opportunity;
  const d = memo.verdict?.decision as Decision | undefined;
  const L: string[] = [];
  L.push(`# ${o.title}`);
  L.push("");
  L.push(`${o.subAgency ?? o.agency}. NAICS ${o.naics}. ${CERT_LABEL[o.setAside] ?? o.setAside}. Place: ${o.placeOfPerformance}. Due ${o.responseDeadline}.`);
  if (o.sourceUrl) L.push(`Notice: ${o.sourceUrl}`);
  L.push("");
  L.push(`Evaluated for: ${memo.profile.name}`);
  L.push("");
  if (memo.verdict && d) {
    L.push(`## Verdict: ${VERDICT[d].label} (${memo.verdict.confidence} confidence)`);
    L.push("");
    for (const r of memo.verdict.rationale) L.push(`- ${r.point}${r.claimIds.length ? " " + r.claimIds.map((n) => `[${n}]`).join("") : ""}`);
    if (memo.verdict.risks.length) { L.push("", "### Risks"); for (const r of memo.verdict.risks) L.push(`- ${r}`); }
    if (memo.verdict.nextSteps.length) { L.push("", "### Next steps"); for (const r of memo.verdict.nextSteps) L.push(`- ${r}`); }
  } else {
    L.push("## No verdict", "", memo.errors.join(" ") || "This notice did not clear the rules check, so no model was run.");
  }
  L.push("", "## Rules check", "");
  for (const c of memo.gate.checks) L.push(`- ${c.pass ? "Pass" : "Fail"}: ${c.reason}`);
  if (memo.supportedClaims.length) {
    L.push("", "## Evidence", "");
    const title = new Map(memo.sources.map((s) => [s.url, s.title]));
    memo.supportedClaims.forEach((c, i) => {
      L.push(`${i + 1}. ${c.text}`);
      for (const u of c.sourceUrls) L.push(`   - ${title.get(u) ?? "Source"}: ${u}`);
    });
  }
  if (memo.droppedClaims.length) {
    L.push("", `## Claims the system refused to show (${memo.droppedClaims.length})`, "");
    for (const c of memo.droppedClaims) L.push(`- ${c.text} (dropped: ${c.reason})`);
  }
  L.push("", "---", `Run ${memo.runId}, ${memo.createdAt.slice(0, 10)}. Cost $${memo.cost.totalUsd.toFixed(4)}. Models: NVIDIA Nemotron on Nebius Token Factory. Research: Tavily and USAspending.gov.`);
  return L.join("\n") + "\n";
}
