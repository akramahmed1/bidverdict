import { NextResponse } from "next/server";
import { readLedger } from "@/lib/ledger";

export const dynamic = "force-dynamic";

// GET /api/ledger?run=<runId>  -> ledger entries (latest run if no id given)
export function GET(req: Request) {
  const all = readLedger();
  const run = new URL(req.url).searchParams.get("run") ?? all.at(-1)?.runId;
  return NextResponse.json({ runId: run ?? null, entries: run ? all.filter((e) => e.runId === run) : [] });
}
