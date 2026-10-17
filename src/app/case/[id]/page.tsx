import Link from "next/link";
import { notFound } from "next/navigation";
import { getOpportunity, listProfiles, loadMemo, loadProfile } from "@/lib/cases";
import { runGate } from "@/lib/gate";
import { hasLiveKeys } from "@/lib/config";
import { getHostedMode } from "@/lib/mode";
import { CERT_LABEL, RULE_LABEL, VERDICT, shortDate, usd, type Decision } from "@/lib/ui";
import { ApprovalPanel, RunButton } from "./RunPanel";

export const dynamic = "force-dynamic";

export default async function CasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ profile?: string }> }) {
  const { id: rawId } = await params;
  const sp = await searchParams;
  const id = decodeURIComponent(rawId);
  const opp = getOpportunity(id);
  if (!opp) notFound();
  const pid = listProfiles().some((p) => p.id === sp.profile) ? (sp.profile as string) : "demo";
  const profile = loadProfile(pid);
  const memo = loadMemo(id, pid);
  const gate = memo ? memo.gate : runGate(opp, profile, new Date());
  const gateAsOf = memo ? memo.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const canRun = !getHostedMode() && hasLiveKeys() && gate.pass;
  const why = getHostedMode() ? "Live runs are off on the hosted demo. Saved runs replay at $0." : !hasLiveKeys() ? "No API key on this machine." : "Blocked by the rules.";
  const sourceByUrl = new Map((memo?.sources ?? []).map((s) => [s.url, s]));
  const v = memo?.verdict;
  const d = v?.decision as Decision | undefined;
  const confN = v ? ({ low: 1, medium: 2, high: 3 } as const)[v.confidence] : 0;

  return (
    <>
      <p className="crumb"><Link href={`/?profile=${pid}`}>All opportunities for {profile.name.replace(" (sample)", "")}</Link></p>

      <div className="case-head">
        <h1 style={{ maxWidth: "26ch" }}>{opp.title}</h1>
        <div className="facts">
          <span><b>{opp.subAgency ?? opp.agency}</b></span>
          <span>NAICS <b>{opp.naics}</b></span>
          <span>{CERT_LABEL[opp.setAside] ?? opp.setAside}</span>
          <span>Place <b>{opp.placeOfPerformance}</b></span>
          <span>Due <b>{shortDate(opp.responseDeadline)}</b></span>
          {opp.sourceUrl && <a href={opp.sourceUrl}>Open the SAM.gov notice</a>}
        </div>
      </div>

      <div className="case-grid">
        <div>
          {d && v ? (
            <section className={`verdict-block ${VERDICT[d].cls}`}>
              <p className="verdict-word">{VERDICT[d].label}</p>
              <div className="verdict-sub">
                <span className="conf" aria-hidden="true">{[1, 2, 3].map((n) => <i key={n} className={n <= confN ? "on" : ""} />)}</span>
                <span>{v.confidence[0].toUpperCase() + v.confidence.slice(1)} confidence. {VERDICT[d].sentence}</span>
              </div>
              <ul className="rationale">
                {v.rationale.map((r, i) => (
                  <li key={i}>
                    {r.point}
                    {r.claimIds.length > 0 && <sup className="ref">{r.claimIds.map((n) => <a key={n} href={`#claim-${n}`} aria-label={`Evidence ${n}`}>[{n}]</a>)}</sup>}
                  </li>
                ))}
              </ul>
              <div className="two">
                {v.risks.length > 0 && <div><h3>Risks</h3><ul>{v.risks.map((r, i) => <li key={i}>{r}</li>)}</ul></div>}
                {v.nextSteps.length > 0 && <div><h3>Next steps</h3><ul>{v.nextSteps.map((r, i) => <li key={i}>{r}</li>)}</ul></div>}
              </div>
            </section>
          ) : !gate.pass ? (
            <section className="verdict-block v-none">
              <p className="verdict-word">Blocked</p>
              <p className="rationale" style={{ margin: "14px 0 0" }}>The rules stopped this before any research or model call. $0.0000 spent. The reasons are listed on the right.</p>
            </section>
          ) : (
            <section className="verdict-block v-none">
              <p className="verdict-word">Not run</p>
              <p className="rationale" style={{ margin: "14px 0 18px" }}>This company is eligible, but there is no saved memo for this notice yet.</p>
              <RunButton caseId={opp.id} profile={pid} enabled={canRun} why={why} />
            </section>
          )}

          {memo && !memo.verdict && memo.errors.length > 0 && <p className="empty">No verdict was produced. {memo.errors.join(" ")}</p>}

          {memo && (memo.supportedClaims.length > 0 || memo.droppedClaims.length > 0) && (
            <>
              <h2>Evidence</h2>
              <p className="small mut" style={{ maxWidth: "62ch" }}>
                {memo.supportedClaims.length} claims survived checking. Each cites a source found in this run, and a second pass confirmed the source supports it and applies to this notice.
              </p>
              {memo.supportedClaims.map((c, i) => (
                <div key={i} id={`claim-${i + 1}`} className="claim">
                  <span className="n">{i + 1}</span>
                  <div>
                    <p>{c.text}</p>
                    {c.sourceUrls.map((u) => (
                      <div key={u} className="src"><a href={u}>{sourceByUrl.get(u)?.title ?? u}</a></div>
                    ))}
                  </div>
                </div>
              ))}
              {memo.droppedClaims.length > 0 && (
                <details>
                  <summary>{memo.droppedClaims.length} claims the system refused to show</summary>
                  <div className="stack" style={{ marginTop: 12 }}>
                    {memo.droppedClaims.map((c, i) => (
                      <div key={i}><p className="small" style={{ marginBottom: 2 }}>{c.text}</p><p className="tiny mut" style={{ margin: 0 }}>Dropped because: {c.reason}</p></div>
                    ))}
                  </div>
                </details>
              )}
            </>
          )}

          {memo?.verdict && <ApprovalPanel runId={memo.runId} />}
          {memo && !memo.stoppedAtGate && canRun && <div style={{ marginTop: 24 }}><RunButton caseId={opp.id} profile={pid} enabled={canRun} why={why} /></div>}
        </div>

        <aside aria-label="Checks and cost">
          <div className="aside-block">
            <h3>Rules check</h3>
            {gate.checks.map((c) => (
              <div key={c.rule} className="check">
                <span className={`pip ${c.pass ? "ok" : "no"}`}>{RULE_LABEL[c.rule].letter}</span>
                <span><b>{RULE_LABEL[c.rule].name}.</b> {c.reason}</span>
              </div>
            ))}
            <p className="tiny mut" style={{ margin: 0 }}>Checked in code as of {gateAsOf}. No model is involved.</p>
          </div>

          {memo?.history && (
            <div className="aside-block">
              <h3>Who wins this work</h3>
              <div className="big">{memo.history.total.toLocaleString("en-US")}</div>
              <span>contracts in 5 years, this agency and NAICS</span>
              <div className="big" style={{ marginTop: 14 }}>{memo.history.smallBizAwards.toLocaleString("en-US")}</div>
              <span>carried a small-business set-aside</span>
              <p className="tiny mut" style={{ margin: "14px 0 0" }}>Top recipients: {memo.history.topRecipients.map((r) => r.name).slice(0, 3).join("; ") || "none listed"}. Source: USAspending.gov.</p>
            </div>
          )}

          {memo && !memo.stoppedAtGate && (
            <div className="aside-block">
              <h3>Cost of this memo</h3>
              <div className="big">{usd(memo.cost.totalUsd)}</div>
              <span>{memo.calls.length} model calls on NVIDIA Nemotron via Nebius</span>
              <details style={{ marginTop: 14 }}>
                <summary>Call log</summary>
                <table style={{ marginTop: 8 }}>
                  <tbody>
                    {memo.calls.map((c, i) => (
                      <tr key={i}><td className="tiny">{c.tier}<br /><span className="mut">{c.purpose}</span></td><td className="tiny">{c.inputTokens}/{c.outputTokens}</td><td className="tiny">{usd(c.usd)}</td></tr>
                    ))}
                  </tbody>
                </table>
                <p className="tiny mut" style={{ margin: "8px 0 0" }}>Run {memo.runId}</p>
              </details>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
