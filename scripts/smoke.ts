// One tiny live call per tier, logged to the ledger and saved as a dated run log
// in runs/ (no keys in the log). Expected total cost: a fraction of a cent.
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { callTier } from "../src/lib/tokenFactory";
import type { Tier } from "../src/lib/config";

async function main() {
  const runId = `smoke-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const state = { runId, loops: 0 };
  const out: Record<string, unknown>[] = [];

  for (const tier of ["nano", "super", "ultra"] as Tier[]) {
    try {
      const r = await callTier(state, tier, "smoke test", [
        { role: "user", content: "Reply with exactly: OK" },
      ]);
      out.push({ tier, model: r.model, text: r.text.trim().slice(0, 40), inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: r.costUsd, latencyMs: r.latencyMs, mock: r.mock });
      console.log(`${tier.padEnd(5)} ${r.model}  ${r.latencyMs}ms  $${r.costUsd.toFixed(6)}  "${r.text.trim().slice(0, 40)}"`);
    } catch (e) {
      out.push({ tier, error: (e as Error).message });
      console.error(`${tier.padEnd(5)} FAILED: ${(e as Error).message}`);
    }
  }

  mkdirSync("runs", { recursive: true });
  const path = `runs/${runId}.json`;
  writeFileSync(path, JSON.stringify({ runId, at: new Date().toISOString(), results: out }, null, 2));
  const total = out.reduce((s, r) => s + (Number(r.costUsd) || 0), 0);
  console.log(`\nTotal: $${total.toFixed(6)}. Log: ${path}`);
}
main();
