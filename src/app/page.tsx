import Link from "next/link";
import { hasLiveKeys, isMockMode } from "@/lib/config";
import { getHostedMode } from "@/lib/mode";
import { listOpportunities, listProfiles, loadMemo, loadProfile } from "@/lib/cases";
import { runGate } from "@/lib/gate";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ profile?: string }> }) {
  const sp = await searchParams;
  const opps = listOpportunities();
  const profiles = listProfiles();
  const pid = profiles.some((p) => p.id === sp.profile) ? (sp.profile as string) : "demo";
  const profile = loadProfile(pid);
  const mode = isMockMode() ? "MOCK" : getHostedMode() ? "REPLAY" : hasLiveKeys() ? "LIVE" : "REPLAY";
  return (
    <>
      <h1>Should we bid on this?</h1>
      <p className="mut">
        Rules are checked in code first. Award history comes from government records. Live research comes from Tavily.
        NVIDIA Nemotron on Nebius Token Factory writes the reasoning. Every claim must cite a source from this run, and
        nothing is final until a person approves it.
      </p>
      <p>
        <span className={`pill ${mode === "LIVE" ? "ok" : mode === "MOCK" ? "warn" : "neutral"}`}>{mode}</span>
        <span className="small mut">
          {mode === "LIVE" ? "Live runs enabled (spends model credits)." : mode === "MOCK" ? "Developer fixtures, not real model output." : "Showing saved real runs. Replays cost $0."}
        </span>
      </p>

      <div className="card">
        <h3>Company profile</h3>
        <div style={{ margin: "4px 0 8px" }}>
          {profiles.map((p) => (
            <Link key={p.id} href={`/?profile=${p.id}`} className={`btn ${p.id === pid ? "primary" : ""}`} style={{ marginRight: 8 }}>
              {p.profile.name}
            </Link>
          ))}
        </div>
        <div className="small">
          {profile.name} · NAICS {profile.naics.join(", ") || "none registered"} · Set-asides: {profile.certifications.join(", ") || "none"} · Works in{" "}
          {profile.placesOfPerformance.join(", ")}
        </div>
      </div>

      <h2>Real open opportunities from SAM.gov</h2>
      <div className="grid">
        {opps.map((o) => {
          const memo = pid === "demo" ? loadMemo(o.id) : null;
          // A saved run keeps the gate result as of the day it was made, so replays stay stable after deadlines pass.
          const gate = memo ? memo.gate : runGate(o, profile, new Date());
          return (
            <Link key={o.id} href={`/case/${encodeURIComponent(o.id)}?profile=${pid}`} className="card" style={{ textDecoration: "none", color: "inherit" }}>
              <h3>{o.title}</h3>
              <div className="small mut">{o.subAgency ?? o.agency} · NAICS {o.naics} · due {o.responseDeadline.slice(0, 10)}</div>
              <div style={{ marginTop: 8 }}>
                <span className={`pill ${gate.pass ? "ok" : "bad"}`}>{gate.pass ? "Eligible" : "Blocked by rules"}</span>
                {memo?.verdict && <span className="pill neutral">{memo.verdict.decision.replace("_", "-")}</span>}
                {!memo && gate.pass && <span className="pill warn">no run yet</span>}
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
