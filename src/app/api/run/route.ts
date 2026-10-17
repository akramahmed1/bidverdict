import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getOpportunity, listProfiles, loadProfile, memoPath } from "@/lib/cases";
import { getHostedMode } from "@/lib/mode";
import { hasLiveKeys } from "@/lib/config";
import { runPipeline } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// POST /api/run { caseId, profile }  Live run, streamed as newline-delimited JSON so the page can show progress.
// Disabled on hosted replay-only deployments.
export async function POST(req: Request) {
  if (getHostedMode()) return json({ error: "Live runs are disabled on the hosted demo. Saved runs replay at $0." }, 403);
  if (!hasLiveKeys()) return json({ error: "NEBIUS_API_KEY is not set; live runs are disabled." }, 403);
  const { caseId, profile } = (await req.json()) as { caseId?: string; profile?: string };
  const opp = caseId ? getOpportunity(caseId) : null;
  if (!opp) return json({ error: "Unknown case" }, 404);
  const pid = listProfiles().some((p) => p.id === profile) ? (profile as string) : "demo";

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        const memo = await runPipeline(opp, loadProfile(pid), undefined, undefined, (step, message) => send({ type: "step", step, message }));
        const p = memoPath(opp.id, pid);
        mkdirSync(dirname(p), { recursive: true });
        writeFileSync(p, JSON.stringify(memo, null, 2));
        send({ type: "done", runId: memo.runId, decision: memo.verdict?.decision ?? null, costUsd: memo.cost.totalUsd, errors: memo.errors });
      } catch (e) {
        send({ type: "error", message: (e as Error).message });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
}
