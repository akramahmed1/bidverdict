"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function RunButton({ caseId, enabled, why }: { caseId: string; enabled: boolean; why: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();
  async function go() {
    setBusy(true);
    setErr("");
    const r = await fetch("/api/run", { method: "POST", body: JSON.stringify({ caseId }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) setErr(j.error ?? "Run failed");
    else router.refresh();
  }
  return (
    <div>
      <button className="primary" disabled={!enabled || busy} onClick={go}>{busy ? "Running live (about 30 seconds)..." : "Run live"}</button>
      {!enabled && <span className="small mut" style={{ marginLeft: 10 }}>{why}</span>}
      {err && <p className="small" style={{ color: "var(--bad)" }}>{err}</p>}
    </div>
  );
}

export function ApprovalPanel({ runId }: { runId: string }) {
  const [note, setNote] = useState("");
  const [state, setState] = useState<null | { decision: string; persisted: boolean }>(null);
  async function send(decision: string) {
    const r = await fetch("/api/approval", { method: "POST", body: JSON.stringify({ runId, decision, note }) });
    const j = await r.json().catch(() => ({ persisted: false }));
    setState({ decision, persisted: Boolean(j.persisted) });
  }
  if (state)
    return (
      <div className="card">
        <strong>Decision recorded: {state.decision.replace("_", " ")}.</strong>{" "}
        <span className="small mut">{state.persisted ? "Saved to the ledger." : "Hosted demo: shown for this session only, not saved."}</span>
      </div>
    );
  return (
    <div className="card">
      <h3>Human approval</h3>
      <p className="small mut" style={{ marginTop: 0 }}>Nothing is final until a person decides. The decision and your note are written to the ledger.</p>
      <textarea rows={2} placeholder="Optional note" value={note} onChange={(e) => setNote(e.target.value)} />
      <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="primary" onClick={() => send("approve")}>Approve</button>
        <button onClick={() => send("send_back")}>Send back</button>
        <button onClick={() => send("reject")}>Reject</button>
      </div>
    </div>
  );
}
