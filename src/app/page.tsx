import Link from "next/link";
import { listOpportunities, listProfiles, loadMemo, loadProfile } from "@/lib/cases";
import { runGate } from "@/lib/gate";
import { CERT_LABEL, RULE_LABEL, VERDICT, shortDate, type Decision } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ profile?: string; eligible?: string }> }) {
  const sp = await searchParams;
  const opps = listOpportunities();
  const profiles = listProfiles().filter((p) => p.id !== "sq-trading").sort((a, b) => a.profile.name.localeCompare(b.profile.name));
  const pid = profiles.some((p) => p.id === sp.profile) ? (sp.profile as string) : "demo";
  const profile = loadProfile(pid);
  const onlyEligible = sp.eligible === "1";

  const rows = opps.map((o) => {
    const memo = loadMemo(o.id, pid);
    const gate = memo ? memo.gate : runGate(o, profile, new Date());
    return { o, memo, gate };
  });
  const eligible = rows.filter((r) => r.gate.pass).length;
  const decided = rows.filter((r) => r.memo?.verdict).length;
  const shown = onlyEligible ? rows.filter((r) => r.gate.pass) : rows;
  const q = (extra: Record<string, string>) => "/?" + new URLSearchParams({ profile: pid, ...extra }).toString();

  return (
    <div className="split">
      <aside className="rail" aria-label="Choose a company">
        <h2>Evaluate as</h2>
        <div className="companies">
        {profiles.map((p) => (
          <Link key={p.id} href={`/?profile=${p.id}`} className="company" aria-current={p.id === pid ? "true" : undefined}>
            <div className="nm">{p.profile.name.replace(" (sample)", "")}</div>
            <div className="meta">{p.profile.hqState} · {p.profile.size === "large" ? "Large business" : p.profile.certifications.filter((c) => c !== "SBA").map((c) => CERT_LABEL[c] ?? c).join(", ") || "Small business"}</div>
          </Link>
        ))}
        </div>
        <dl className="profile-note">
          <dt>NAICS codes</dt><dd>{profile.naics.join(", ") || "None registered"}</dd>
          <dt>Set-asides</dt><dd>{profile.certifications.map((c) => CERT_LABEL[c] ?? c).join(", ") || "None"}</dd>
          <dt>Works in</dt><dd>{profile.placesOfPerformance.join(", ")}</dd>
          <dt>Track record</dt><dd>{profile.pastPerformance}</dd>
          <dt>Capacity</dt><dd>{profile.capacityNotes}</dd>
        </dl>
        <p className="tiny mut" style={{ marginTop: 14 }}>Sample company. Invented for testing. The opportunities and award data it is checked against are real.</p>
      </aside>

      <section>
        <h1>Should this company bid?</h1>
        <p className="lede">
          Fifteen real open notices from SAM.gov. The rules decide eligibility in code. Only the eligible ones go to the AI, and every claim in a memo must cite a source from that run.
        </p>
        <div className="tally">
          <div><b>{rows.length - eligible}</b><span>blocked by rules, $0 spent</span></div>
          <div><b>{eligible}</b><span>eligible</span></div>
          <div><b>{decided}</b><span>with a saved memo</span></div>
        </div>
        <p className="small" style={{ margin: "0 0 4px" }}>
          <Link className="toggle" href={onlyEligible ? q({}) : q({ eligible: "1" })}>{onlyEligible ? "Show all 15" : "Show only eligible"}</Link>
        </p>
        <div>
          {shown.map(({ o, memo, gate }) => {
            const d = memo?.verdict?.decision as Decision | undefined;
            return (
              <Link key={o.id} href={`/case/${encodeURIComponent(o.id)}?profile=${pid}`} className="opp">
                <span className="t">{o.title}</span>
                <span className="m">{o.subAgency ?? o.agency}. NAICS {o.naics}, {CERT_LABEL[o.setAside] ?? o.setAside}, {o.placeOfPerformance}. Due {shortDate(o.responseDeadline)}.</span>
                <span className="r">
                  {d ? <span className={`chip ${VERDICT[d].cls}`}>{VERDICT[d].label}</span> : gate.pass ? <span className="chip plain">Eligible, not run</span> : <span className="chip plain">Blocked</span>}
                  <span className="pips" aria-label="Rule checks">
                    {gate.checks.map((c) => (
                      <span key={c.rule} className={`pip ${c.pass ? "ok" : "no"}`} title={`${RULE_LABEL[c.rule].name}: ${c.reason}`}>{RULE_LABEL[c.rule].letter}</span>
                    ))}
                  </span>
                </span>
              </Link>
            );
          })}
          {shown.length === 0 && <p className="empty">Nothing clears the rules for this company. Pick another company, or show all 15 to see why each is blocked.</p>}
        </div>
        <p className="tiny mut" style={{ marginTop: 14 }}>The four marks are the rules: Deadline, Set-aside, NAICS, Place. Green passed, red failed. Hover for the reason.</p>
      </section>
    </div>
  );
}
