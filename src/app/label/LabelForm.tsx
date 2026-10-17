"use client";
import { useState } from "react";

export function LabelForm({ id, current }: { id: string; current?: string }) {
  const [v, setV] = useState(current ?? "");
  const [saved, setSaved] = useState(Boolean(current));
  async function pick(label: string) {
    setV(label);
    const r = await fetch("/api/label", { method: "POST", body: JSON.stringify({ id, label, labeler: "Akram" }) });
    setSaved(r.ok);
  }
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      {["BID", "CONDITIONAL", "NO_BID"].map((l) => (
        <button key={l} className={v === l ? "primary" : ""} onClick={() => pick(l)}>{l.replace("_", "-")}</button>
      ))}
      {saved && <span className="small mut">saved</span>}
    </div>
  );
}
