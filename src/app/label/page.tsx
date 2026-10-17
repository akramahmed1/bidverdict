import { listOpportunities, loadProfile } from "@/lib/cases";
import { runGate } from "@/lib/gate";
import { loadLabels } from "@/lib/evalScores";
import { getHostedMode } from "@/lib/mode";
import { LabelForm } from "./LabelForm";

export const dynamic = "force-dynamic";

// Blind labeling: shows the opportunity and the company, never the agent's verdict.
export default function LabelPage() {
  if (getHostedMode()) return <p>Labeling is local only.</p>;
  const profile = loadProfile();
  const labels = loadLabels();
  const todo = listOpportunities().filter((o) => runGate(o, profile).pass);
  return (
    <>
      <h1>Label the opportunities</h1>
      <p className="mut">
        For each opportunity, decide what this company should do: BID, CONDITIONAL (bid only if something specific is true) or NO-BID.
        You do not see the agent&apos;s answer, so the comparison is fair. Use your own judgment from the notice and the company profile.
      </p>
      <div className="card small"><strong>{profile.name}</strong>: NAICS {profile.naics.join(", ")}; certifications {profile.certifications.join(", ") || "none"}; works in {profile.placesOfPerformance.join(", ")}. {profile.pastPerformance} {profile.capacityNotes}</div>
      {todo.map((o) => (
        <div key={o.id} className="card">
          <h3>{o.title}</h3>
          <div className="small mut">{o.subAgency ?? o.agency} · {o.noticeType} · NAICS {o.naics} · set-aside {o.setAside} · due {o.responseDeadline.slice(0, 10)}{o.sourceUrl && <> · <a href={o.sourceUrl}>SAM.gov</a></>}</div>
          <p className="small">{o.description}</p>
          <LabelForm id={o.id} current={labels.labels[o.id]?.label} />
        </div>
      ))}
    </>
  );
}
