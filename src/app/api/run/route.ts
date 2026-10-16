import { NextResponse } from "next/server";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getOpportunity, loadProfile, memoPath } from "@/lib/cases";
import { getHostedMode } from "@/lib/mode";
import { hasLiveKeys } from "@/lib/config";
import { runPipeline } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/run { caseId }  Live run. Disabled on hosted replay-only deployments.
export async function POST(req: Request) {
  if (getHostedMode()) return NextResponse.json({ error: "Live runs are disabled on the hosted demo. Saved runs replay at $0." }, { status: 403 });
  if (!hasLiveKeys()) return NextResponse.json({ error: "NEBIUS_API_KEY is not set; live runs are disabled." }, { status: 403 });
  const { caseId } = (await req.json()) as { caseId?: string };
  const opp = caseId ? getOpportunity(caseId) : null;
  if (!opp) return NextResponse.json({ error: "Unknown case" }, { status: 404 });
  const memo = await runPipeline(opp, loadProfile());
  const p = memoPath(opp.id);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(memo, null, 2));
  return NextResponse.json({ ok: true, runId: memo.runId });
}
