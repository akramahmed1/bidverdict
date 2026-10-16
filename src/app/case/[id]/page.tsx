import Link from "next/link";
import { notFound } from "next/navigation";
import { getOpportunity, loadMemo, loadProfile } from "@/lib/cases";
import { runGate } from "@/lib/gate";
import { hasLiveKeys } from "@/lib/config";
import { getHostedMode } from "@/lib/mode";
import { ApprovalPanel, RunButton } from "./RunPanel";

export const dynamic = "force-dynamic";

const usd = (n: number) => `$${n.toFixed(4)}`;

export default async function CasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ profile?: string }> }) {
  const { id: rawId } = await params;
  const sp = await searchParams;
  const id = decodeURIComponent(rawId);
  const opp = getOpportunity(id);
  if (!opp) notFound();
  const pid = sp.profile === "sq-trading" ? "sq-trading" : "demo";
  const profile = loadProfile(pid);
  const memo = pid === "demo" ? loadMemo(id) : null;
  const gate = memo ? memo.gate : runGate(opp, profile, new Date());
  const gateAsOf = memo ? memo.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const canRun = !getHostedMode() && hasLiveKeys() && pid === "demo" && gate.pass;
  const why = getHostedMode() ? "Live runs are off on the hosted demo; saved runs replay at $0." : !hasLiveKeys() ? "No API key on this machine." : pid !== "demo" ? "Live runs use the demo profile." : "Blocked by the rules gate.";
  const sourceByUrl = new Map((memo?.sources ?? []).map((s) => [s.url, s]));

  return (
    <>
      <p className="small"><Link href={`/?profile=${pid}`}>← All opportunities</Link></p>
      <h1>{opp.title}</h1>
      <p className="mut small">
        {opp.agency}{opp.subAgency && opp.subAgency !== opp.agency ? ` / ${opp.subAgency}` : ""} · NAICS {opp.naics} · set-aside {opp.setAside} · place {opp.placeOfPerformance} · due {opp.responseDeadline}
        {opp.sourceUrl && <> · <a href={opp.sourceUrl}>SAM.gov notice</a></>}
      </p>
      <p className="small">Evaluating for <strong>{profile.name}</strong></p>

      <div className="card">
        <h3>1. Eligibility gate (code, no model) <span className={`pill ${gate.pass ? "ok" : "bad"}`}>{gate.pass ? "PASS" : "BLOCKED"}</span></h3>
        <p className="small mut" style={{ margin: "0 0 6px" }}>As of {gateAsOf}. A blocked opportunity stops here with $0 of model spend.</p>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {gate.checks.map((c) => (
            <li key={c.rule} className="small"><span className={`pill ${c.pass ? "ok" : "bad"}`}>{c.pass ? "ok" : "fail"}</span>{c.reason}</li>
          ))}
        </ul>
      </div>

      {!gate.pass && (
        <div className="card"><strong>Stopped.</strong> No research and no model calls were made. $0.0000 spent.</div>
      )}

      {gate.pass && !memo && (
        <div className="card">
          <p style={{ marginTop: 0 }}>No saved run for this opportunity yet.</p>
          <RunButton caseId={opp.id} enabled={canRun} why={why} />
        </div>
      )}

      {memo && memo.history && (
        <div className="card">
          <h3>2. Award history (USAspending.gov)</h3>
          <div className="small">
            {memo.history.total.toLocaleString("en-US")} contract awards in the last 5 years for this agency and NAICS; {memo.history.smallBizAwards.toLocaleString("en-US")} carried a small-business set-aside.
            Top recipients: {memo.history.topRecipients.map((r) => r.name).join("; ") || "n/a"}.
          </div>
        </div>
      )}

      {memo?.verdict && (
        <>
          <div className="card">
            <h3>Verdict</h3>
            <div className="verdict">
              <span className={`pill ${memo.verdict.decision === "BID" ? "ok" : memo.verdict.decision === "NO_BID" ? "bad" : "warn"}`}>{memo.verdict.decision.replace("_", "-")}</span>
              <span className="small mut"> {memo.verdict.confidence} confidence</span>
            </div>
            <h3 style={{ marginTop: 12 }}>Why</h3>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {memo.verdict.rationale.map((r, i) => (
                <li key={i}>{r.point} {r.claimIds.map((n) => <a key={n} href={`#claim-${n}`} className="small">[{n}]</a>)}</li>
              ))}
            </ul>
            {memo.verdict.risks.length > 0 && (<><h3 style={{ marginTop: 12 }}>Risks</h3><ul style={{ margin: 0, paddingLeft: 18 }}>{memo.verdict.risks.map((r, i) => <li key={i}>{r}</li>)}</ul></>)}
            {memo.verdict.nextSteps.length > 0 && (<><h3 style={{ marginTop: 12 }}>Next steps</h3><ul style={{ margin: 0, paddingLeft: 18 }}>{memo.verdict.nextSteps.map((r, i) => <li key={i}>{r}</li>)}</ul></>)}
          </div>

          <h2>Evidence: every claim and its source</h2>
          {memo.supportedClaims.map((c, i) => (
            <div key={i} id={`claim-${i + 1}`} className="card">
              <div><span className="pill ok">verified #{i + 1}</span><span className="pill neutral">{c.kind}</span>{c.text}</div>
              {c.sourceUrls.map((u) => (
                <div key={u} className="small src">↳ <a href={u}>{sourceByUrl.get(u)?.title ?? u}</a></div>
              ))}
            </div>
          ))}
          {memo.droppedClaims.length > 0 && (
            <>
              <h2>Claims the system refused to show ({memo.droppedClaims.length})</h2>
              {memo.droppedClaims.map((c, i) => (
                <div key={i} className="card">
                  <div><span className="pill bad">dropped</span>{c.text}</div>
                  <div className="small mut">Why: {c.reason}</div>
                </div>
              ))}
            </>
          )}
          <ApprovalPanel runId={memo.runId} />
        </>
      )}

      {memo && !memo.verdict && memo.errors.length > 0 && (
        <div className="card"><strong>No verdict produced.</strong> {memo.errors.join(" ")}</div>
      )}

      {memo && !memo.stoppedAtGate && (
        <>
          <h2>Cost and calls</h2>
          <div className="card scroll">
            <table>
              <thead><tr>{["Tier", "Step", "Tokens in/out", "Cost", "Latency"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {memo.calls.map((c, i) => (
                  <tr key={i}><td>{c.tier}</td><td>{c.purpose}</td><td>{c.inputTokens}/{c.outputTokens}</td><td>{usd(c.usd)}</td><td>{c.latencyMs} ms</td></tr>
                ))}
                <tr><td colSpan={3}><strong>Total</strong></td><td><strong>{usd(memo.cost.totalUsd)}</strong></td><td /></tr>
              </tbody>
            </table>
            <p className="small mut" style={{ marginBottom: 0 }}>Run {memo.runId}, {memo.createdAt.slice(0, 10)}. Models: NVIDIA Nemotron on Nebius Token Factory. Research: Tavily and USAspending.</p>
          </div>
          {canRun && <RunButton caseId={opp.id} enabled={canRun} why={why} />}
        </>
      )}
    </>
  );
}
