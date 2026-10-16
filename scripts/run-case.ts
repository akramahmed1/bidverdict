// Run the pipeline on real opportunities and save memos for replay.
//   npx tsx scripts/run-case.ts <opportunity-id>      one case
//   npx tsx scripts/run-case.ts --all                 every case that passes the gate for the demo profile
// Memos are written to data/memos/<id>.json (committed, replayed at $0 by the app) and runs/<runId>.json.
import "dotenv/config";
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runPipeline, type Memo } from "../src/lib/pipeline";
import { runGate, type CompanyProfile, type Opportunity } from "../src/lib/gate";

const opps: Opportunity[] = readdirSync("data/opportunities")
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join("data/opportunities", f), "utf8")));
const profile: CompanyProfile = JSON.parse(readFileSync("data/profiles/demo.json", "utf8"));

function show(memo: Memo) {
  console.log(`\n=== ${memo.opportunity.id}: ${memo.opportunity.title.slice(0, 60)}`);
  console.log(`Gate: ${memo.gate.pass ? "PASS" : "FAIL"}${memo.stoppedAtGate ? " (stopped, $0 model spend)" : ""}`);
  if (memo.history) console.log(`History: ${memo.history.total} awards, ${memo.history.smallBizAwards} small-biz set-aside`);
  console.log(`Sources: ${memo.sources.length}  claims kept: ${memo.supportedClaims.length}  dropped: ${memo.droppedClaims.length}`);
  for (const d of memo.droppedClaims) console.log(`  DROPPED: ${d.text.slice(0, 70)} -> ${d.reason.slice(0, 90)}`);
  if (memo.verdict) {
    console.log(`VERDICT: ${memo.verdict.decision} (${memo.verdict.confidence})`);
    for (const r of memo.verdict.rationale) console.log(`  - ${r.point.slice(0, 120)} [${r.claimIds.join(",")}]`);
  }
  for (const e of memo.errors) console.log(`ERROR: ${e}`);
  console.log(`COST: $${memo.cost.totalUsd.toFixed(6)} (${memo.calls.length} calls)`);
}

async function runOne(opp: Opportunity) {
  const memo = await runPipeline(opp, profile);
  mkdirSync("runs", { recursive: true });
  mkdirSync("data/memos", { recursive: true });
  writeFileSync(`runs/${memo.runId}.json`, JSON.stringify(memo, null, 2));
  writeFileSync(`data/memos/${opp.id}.json`, JSON.stringify(memo, null, 2));
  show(memo);
  return memo;
}

async function main() {
  const arg = process.argv[2];
  if (!arg) throw new Error("usage: tsx scripts/run-case.ts <opportunity-id> | --all");
  const targets = arg === "--all" ? opps.filter((o) => runGate(o, profile).pass) : opps.filter((o) => o.id === arg);
  if (!targets.length) throw new Error(`No matching case for "${arg}"`);
  let total = 0;
  for (const o of targets) total += (await runOne(o)).cost.totalUsd;
  console.log(`\nALL DONE. Total cost: $${total.toFixed(6)}`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
