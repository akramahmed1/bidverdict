// Append-only ledger: every model call, tool call, gate decision, validator drop,
// approval and budget event. This is a product feature, not debug output.
//
// Storage: local JSONL for development. Serverless hosts (e.g. Vercel) do not keep
// local files between requests, so the hosted demo replays committed JSON cases from
// data/cases/ and only live runs need a database (to be wired before deploy).

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type LedgerKind =
  | "model_call"
  | "tool_call"
  | "gate"
  | "validator_drop"
  | "approval"
  | "budget";

export interface LedgerEntry {
  ts: string;
  runId: string;
  kind: LedgerKind;
  // model_call fields
  tier?: string;
  model?: string;
  purpose?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  latencyMs?: number;
  // generic
  detail?: Record<string, unknown>;
}

export const LEDGER_PATH = join(process.cwd(), "data", "ledger.jsonl");

// When the disk is read-only (hosted), entries are kept in memory for this server process so the
// per-run budget check still sees what a run has already spent. A hosted run is one invocation.
const memoryEntries: LedgerEntry[] = [];

export function appendLedger(e: Omit<LedgerEntry, "ts">, path = LEDGER_PATH): LedgerEntry {
  const entry: LedgerEntry = { ts: new Date().toISOString(), ...e };
  try {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(path, JSON.stringify(entry) + "\n", "utf8");
  } catch {
    // Read-only filesystem (hosted serverless demo): keep it in memory only.
    memoryEntries.push(entry);
    if (memoryEntries.length > 2000) memoryEntries.splice(0, memoryEntries.length - 2000);
  }
  return entry;
}

export function readLedger(path = LEDGER_PATH): LedgerEntry[] {
  const onDisk = existsSync(path)
    ? readFileSync(path, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l) as LedgerEntry)
    : [];
  return memoryEntries.length ? [...onDisk, ...memoryEntries] : onDisk;
}

export function spentUsd(entries: LedgerEntry[], filter?: (e: LedgerEntry) => boolean): number {
  return entries
    .filter((e) => e.kind === "model_call" && (!filter || filter(e)))
    .reduce((s, e) => s + (e.costUsd ?? 0), 0);
}
