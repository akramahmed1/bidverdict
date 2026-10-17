"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const STEPS: { key: string; label: string }[] = [
  { key: "gate", label: "Rules check" },
  { key: "history", label: "Award history" },
  { key: "classify", label: "Read the requirement" },
  { key: "research", label: "Web research" },
  { key: "claims", label: "Draft claims" },
  { key: "validate", label: "Check every claim" },
  { key: "verdict", label: "Final verdict" },
];

export function RunButton({ caseId, profile, enabled, why }: { caseId: string; profile: string; enabled: boolean; why: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [current, setCurrent] = useState<string>("");
  const [note, setNote] = useState("");
  const router = useRouter();

  async function go() {
    setBusy(true);
    setErr("");
    setCurrent("gate");
    try {
      const r = await fetch("/api/run", { method: "POST", body: JSON.stringify({ caseId, profile }) });
      if (!r.ok || !r.body) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? "Run failed");
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let finished = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line);
          if (ev.type === "step") { setCurrent(ev.step); setNote(ev.message); }
          if (ev.type === "error") throw new Error(ev.message);
          if (ev.type === "done") finished = true;
        }
      }
      if (!finished) throw new Error("The run ended early. Try again.");
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const idx = STEPS.findIndex((s) => s.key === current);
  return (
    <div>
      <button className="primary" disabled={!enabled || busy} onClick={go}>{busy ? "Running live" : "Run live"}</button>
      {!enabled && <span className="small mut" style={{ marginLeft: 10 }}>{why}</span>}
      {busy && (
        <ol className="progress" aria-live="polite">
          {STEPS.map((s, i) => (
            <li key={s.key} className={i < idx ? "done" : i === idx ? "now" : ""}>{s.label}</li>
          ))}
        </ol>
      )}
      {busy && note && <p className="tiny mut" style={{ marginTop: 8 }}>{note}</p>}
      {err && <p className="small" style={{ color: "var(--ox)" }} role="alert">{err}</p>}
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
      <div className="card" role="status">
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

export function PrintButton() {
  return <button onClick={() => window.print()}>Print or save as PDF</button>;
}
