import Link from "next/link";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listOpportunities, listProfiles, loadMemo } from "@/lib/cases";
import { CERT_LABEL, RULE_LABEL, VERDICT, type Decision } from "@/lib/ui";

export const dynamic = "force-dynamic";

interface Matrix { asOf: string; rows: { profile: string; name: string; results: { opp: string; pass: boolean; failed: string[] }[] }[] }

export default function Scenarios() {
  const m: Matrix = JSON.parse(readFileSync(join(process.cwd(), "data", "eval", "scenario-matrix.json"), "utf8"));
  const opps = listOpportunities();
  const byId = Object.fromEntries(opps.map((o) => [o.id, o]));
  const profs = Object.fromEntries(listProfiles().map((p) => [p.id, p.profile]));
  const order = [...m.rows].sort((a, b) => b.results.filter((r) => r.pass).length - a.results.filter((r) => r.pass).length);
  const pairs = m.rows.length * opps.length;
  const blocked = m.rows.reduce((n, r) => n + r.results.filter((x) => !x.pass).length, 0);
  const reasons: Record<string, number> = {};
  for (const r of m.rows) for (const x of r.results) for (const f of x.failed) reasons[f] = (reasons[f] ?? 0) + 1;
  let withMemo = 0;
  const verdicts: Record<string, number> = {};
  for (const r of m.rows) for (const x of r.results) {
    const memo = x.pass ? loadMemo(x.opp, r.profile) : null;
    if (memo?.verdict) { withMemo++; verdicts[memo.verdict.decision] = (verdicts[memo.verdict.decision] ?? 0) + 1; }
  }

  return (
    <>
      <h1>Eight companies against fifteen real notices</h1>
      <p className="lede">
        Each row is a sample company with its own location, certifications and NAICS codes. Each column is a real SAM.gov notice. The rules check runs for every pair. The AI runs only where the rules allow it.
      </p>
      <div className="tally">
        <div><b>{pairs}</b><span>company and notice pairs</span></div>
        <div><b>{blocked}</b><span>blocked by rules, $0 spent</span></div>
        <div><b>{pairs - blocked}</b><span>eligible</span></div>
        <div><b>{withMemo}</b><span>run through the AI so far</span></div>
      </div>

      <div className="legend">
        {(["BID", "CONDITIONAL", "NO_BID", "INSUFFICIENT_EVIDENCE"] as Decision[]).map((d) => (
          <span key={d}><span className={`cell ${VERDICT[d].cls}`}>{VERDICT[d].short}</span>{VERDICT[d].label}{verdicts[d] ? ` (${verdicts[d]})` : ""}</span>
        ))}
        <span><span className="cell todo">·</span>Eligible, not run</span>
        <span><span className="cell blocked">NP</span>Blocked: letters are the failed rules</span>
      </div>

      <div className="matrix-wrap">
        <table className="matrix">
          <thead>
            <tr>
              <th />
              {m.rows[0].results.map((x) => (
                <th key={x.opp} className="col" scope="col"><span title={byId[x.opp]?.title}>{(byId[x.opp]?.subAgency ?? byId[x.opp]?.agency ?? "").replace("Department of ", "").slice(0, 22)}: {byId[x.opp]?.title.slice(0, 30)}</span></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {order.map((r) => (
              <tr key={r.profile}>
                <th className="row" scope="row">
                  <Link href={`/?profile=${r.profile}`} style={{ textDecoration: "none" }}>{r.name.replace(" (sample)", "")}</Link>
                  <small>{profs[r.profile]?.hqState}. {(profs[r.profile]?.certifications ?? []).filter((c) => c !== "SBA").map((c) => CERT_LABEL[c] ?? c).join(", ") || (profs[r.profile]?.size === "large" ? "Large business" : "Small business")}. {r.results.filter((x) => x.pass).length} of {r.results.length} eligible</small>
                </th>
                {r.results.map((x) => {
                  const href = `/case/${encodeURIComponent(x.opp)}?profile=${r.profile}`;
                  if (!x.pass) {
                    const letters = x.failed.map((f) => RULE_LABEL[f]?.letter ?? "?").join("");
                    return <td key={x.opp}><Link href={href} className="cell blocked" title={`Blocked: ${x.failed.map((f) => RULE_LABEL[f]?.name).join(", ")}`}>{letters}</Link></td>;
                  }
                  const d = loadMemo(x.opp, r.profile)?.verdict?.decision as Decision | undefined;
                  return d ? (
                    <td key={x.opp}><Link href={href} className={`cell ${VERDICT[d].cls}`} title={VERDICT[d].label}>{VERDICT[d].short}</Link></td>
                  ) : (
                    <td key={x.opp}><Link href={href} className="cell todo" title="Eligible, no saved memo">·</Link></td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>What this shows</h2>
      <div className="two" style={{ marginTop: 0 }}>
        <div>
          <h3>Why pairs were blocked</h3>
          <ul>
            {Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([k, n]) => <li key={k}>{RULE_LABEL[k]?.name ?? k}: {n} pairs</li>)}
          </ul>
          <p className="tiny mut">A pair can fail more than one rule, so these add up to more than the blocked total.</p>
        </div>
        <div>
          <h3>How it was checked</h3>
          <ul>
            <li>The notices are real SAM.gov listings. The set-aside, NAICS code, place and deadline come from the notice.</li>
            <li>Every NAICS code on a sample company was confirmed against the USAspending reference list on Oct 16, 2026.</li>
            <li>The rules check is evaluated as of {m.asOf.slice(0, 10)} so this page does not change as deadlines pass.</li>
            <li>The companies are invented. Their track records are invented too, and are labeled that way.</li>
          </ul>
        </div>
      </div>
    </>
  );
}
