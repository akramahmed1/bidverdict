import { agreement, gateScore, loadLabels } from "@/lib/evalScores";
import { listOpportunities, loadMemo } from "@/lib/cases";

export const dynamic = "force-dynamic";

export default function EvalPage() {
  const g = gateScore();
  const labels = loadLabels();
  const memos = Object.fromEntries(listOpportunities().map((o) => [o.id, loadMemo(o.id)]));
  const a = agreement(labels, memos);
  const labeled = Object.keys(labels.labels).length;
  const withVerdict = Object.values(memos).filter((m) => m?.verdict).length;
  return (
    <>
      <h1>How well does it work?</h1>
      <p className="mut">Two separate numbers. They are never averaged together.</p>

      <div className="card">
        <h3>1. Rules gate: {g.correct} of {g.total} correct</h3>
        <p className="small mut" style={{ marginBottom: 0 }}>
          Deterministic cases (set-asides, NAICS codes, places, deadlines, timezone handling). The expected answers come from the stated rules, not from the code&apos;s output, and the code must score 100%.
          {g.wrong.length > 0 && <> Failing: {g.wrong.join("; ")}.</>}
        </p>
      </div>

      <div className="card">
        <h3>2. Agent vs a human label: {a.n === 0 ? "not measured yet" : `${a.exact} of ${a.n} exact matches, ${a.flips} direct reversals`}</h3>
        <p className="small mut">
          On real SAM.gov opportunities that pass the gate, a person labels BID, CONDITIONAL or NO-BID without seeing the agent&apos;s answer. A reversal means one said BID and the other NO-BID.
          Labeled so far: {labeled} of {withVerdict} opportunities with an agent verdict{labels.labeler ? `, by ${labels.labeler}` : ""}. {a.abstained > 0 && `The agent declined to answer ${a.abstained} (insufficient verified evidence); those are not counted as matches or misses.`}
        </p>
        {a.rows.length > 0 && (
          <div className="scroll">
            <table>
              <thead><tr><th>Opportunity</th><th>Agent</th><th>Human</th><th /></tr></thead>
              <tbody>{a.rows.map((r) => (<tr key={r.id}><td className="small">{r.id}</td><td>{r.agent.replace("_", "-")}</td><td>{r.human.replace("_", "-")}</td><td>{r.exact ? "match" : r.flip ? "reversal" : "partial"}</td></tr>))}</tbody>
            </table>
          </div>
        )}
        <p className="small mut" style={{ marginBottom: 0 }}>Small sample, one labeler, a fictional demo company. Treat it as a sanity check, not a benchmark.</p>
      </div>
    </>
  );
}
