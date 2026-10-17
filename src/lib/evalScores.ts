// Two honest numbers, never blended:
//   1. Gate correctness on deterministic cases (data/eval/gate-cases.json). Code, must be 100%.
//   2. Agreement between the agent's verdict and a human's blind label on real opportunities.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runGate } from "./gate";
import type { Memo } from "./pipeline";

export type Label = "BID" | "NO_BID" | "CONDITIONAL";
export interface LabelFile { labeler: string; labels: Record<string, { label: Label; note?: string; at: string }> }

const p = (...a: string[]) => join(process.cwd(), ...a);

export function gateScore() {
  const { cases } = JSON.parse(readFileSync(p("data", "eval", "gate-cases.json"), "utf8"));
  let correct = 0;
  const wrong: string[] = [];
  for (const c of cases) {
    const r = runGate(c.opportunity, c.profile, new Date(c.now));
    const failed = r.checks.filter((x: { pass: boolean }) => !x.pass).map((x: { rule: string }) => x.rule).sort().join(",");
    const ok = r.pass === c.expectPass && failed === [...c.expectFailedRules].sort().join(",");
    if (ok) correct++; else wrong.push(c.name);
  }
  return { total: cases.length as number, correct, wrong };
}

export function loadLabels(): LabelFile {
  const f = p("data", "eval", "labels.json");
  return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as LabelFile) : { labeler: "", labels: {} };
}

export function agreement(labels: LabelFile, memos: Record<string, Memo | null>) {
  let abstained = 0;
  const rows: { id: string; agent: Label; human: Label; exact: boolean; flip: boolean }[] = [];
  for (const [id, l] of Object.entries(labels.labels)) {
    const v = memos[id]?.verdict?.decision;
    if (!v) continue;
    if (v === "INSUFFICIENT_EVIDENCE") { abstained++; continue; }
    rows.push({ id, agent: v, human: l.label, exact: v === l.label, flip: (v === "BID" && l.label === "NO_BID") || (v === "NO_BID" && l.label === "BID") });
  }
  return {
    n: rows.length,
    abstained,
    exact: rows.filter((r) => r.exact).length,
    flips: rows.filter((r) => r.flip).length,
    rows,
  };
}
