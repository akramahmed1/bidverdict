import { NextResponse } from "next/server";
import { appendLedger } from "@/lib/ledger";

export const dynamic = "force-dynamic";

// POST /api/approval { runId, decision: approve|reject|send_back, note }
// Local runs append to the ledger. The hosted demo has a read-only disk, so it reports persisted:false.
export async function POST(req: Request) {
  const b = (await req.json()) as { runId?: string; decision?: string; note?: string };
  if (!b.runId || !["approve", "reject", "send_back"].includes(b.decision ?? "")) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const hosted = Boolean(process.env.VERCEL) || process.env.BIDVERDICT_REPLAY_ONLY === "1";
  if (!hosted) appendLedger({ runId: b.runId, kind: "approval", detail: { decision: b.decision, note: (b.note ?? "").slice(0, 500) } });
  return NextResponse.json({ ok: true, persisted: !hosted });
}
