// Scenario matrix: every sample company x every real opportunity through the deterministic gate.
// Free, offline, reproducible. Writes data/eval/scenario-matrix.json for the Scenarios page.
//   npx tsx scripts/matrix.ts
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { runGate, type CompanyProfile, type Opportunity } from "../src/lib/gate";

export const AS_OF = "2026-10-16T12:00:00-05:00";
const opps: Opportunity[] = readdirSync("data/opportunities").filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join("data/opportunities", f), "utf8")));
const profiles: CompanyProfile[] = readdirSync("data/profiles").filter((f) => f.endsWith(".json") && !f.startsWith("sq-")).map((f) => ({ ...JSON.parse(readFileSync(join("data/profiles", f), "utf8")), id: f.replace(/\.json$/, "") }));
const now = new Date(AS_OF);
const rows = profiles.map((p) => ({
  profile: (p as any).id as string,
  name: p.name,
  results: opps.map((o) => {
    const g = runGate(o, p, now);
    return { opp: o.id, pass: g.pass, failed: g.checks.filter((c) => !c.pass).map((c) => c.rule) };
  }),
}));
mkdirSync("data/eval", { recursive: true });
writeFileSync("data/eval/scenario-matrix.json", JSON.stringify({ asOf: AS_OF, rows }, null, 2));
for (const r of rows) {
  const pass = r.results.filter((x) => x.pass);
  console.log(r.profile.padEnd(22), `${pass.length}/${r.results.length} pass`, "| fails:", r.results.filter((x) => !x.pass).map((x) => x.failed.join("+")).reduce((a: Record<string, number>, k) => ((a[k] = (a[k] || 0) + 1), a), {}));
}
