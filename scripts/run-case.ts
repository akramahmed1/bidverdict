// Run the full pipeline on a case file: npx tsx scripts/run-case.ts data/cases/<file>.json
import "dotenv/config";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { runPipeline } from "../src/lib/pipeline";

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("usage: tsx scripts/run-case.ts <case.json>");
  const { opportunity, profile } = JSON.parse(readFileSync(file, "utf8"));
  const memo = await runPipeline(opportunity, profile);
  mkdirSync("runs", { recursive: true });
  const out = `runs/${memo.runId}.json`;
  writeFileSync(out, JSON.stringify(memo, null, 2));
  console.log(`Gate: ${memo.gate.pass ? "PASS" : "FAIL"}${memo.stoppedAtGate ? " (stopped, $0 model spend)" : ""}`);
  for (const c of memo.gate.checks) console.log(`  ${c.pass ? "ok  " : "FAIL"} ${c.rule}: ${c.reason}`);
  if (memo.history) console.log(`History: ${memo.history.total} awards, ${memo.history.smallBizAwards} small-biz set-aside`);
  console.log(`Sources: ${memo.sources.length}  Claims supported: ${memo.supportedClaims.length}  dropped: ${memo.droppedClaims.length}`);
  for (const d of memo.droppedClaims) console.log(`  DROPPED: ${d.text.slice(0, 80)} -> ${d.reason.slice(0, 80)}`);
  if (memo.verdict) {
    console.log(`\nVERDICT: ${memo.verdict.decision} (${memo.verdict.confidence} confidence)`);
    for (const r of memo.verdict.rationale) console.log(`  - ${r.point} [claims ${r.claimIds.join(",")}]`);
  }
  for (const e of memo.errors) console.log(`ERROR: ${e}`);
  console.log("\nCalls:");
  for (const c of memo.calls) console.log(`  ${c.tier.padEnd(5)} ${c.purpose.padEnd(34)} in ${c.inputTokens} out ${c.outputTokens} $${c.usd.toFixed(6)} ${c.latencyMs}ms`);
  console.log(`TOTAL COST: $${memo.cost.totalUsd.toFixed(6)}   Memo: ${out}`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
