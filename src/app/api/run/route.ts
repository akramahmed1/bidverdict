import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getOpportunity, listProfiles, loadProfile, memoPath } from "@/lib/cases";
import { getHostedMode } from "@/lib/mode";
import { hasLiveKeys } from "@/lib/config";
import { runGate } from "@/lib/gate";
import { runPipeline } from "@/lib/pipeline";
import { hostedLiveEnabled, reserveRun, saveLiveMemo, settleRun } from "@/lib/liveStore";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// POST /api/run { caseId, profile }  Live run, streamed as newline-delimited JSON so the page can show progress.
// Local: runs with the machine's keys. Hosted: only when the owner turned live runs on, and every run
// first reserves its worst-case cost from a shared budget (see liveStore.ts). Otherwise replay only.
export async function POST(req: Request) {
  const hosted = getHostedMode();
  if (hosted && !hostedLiveEnabled()) return json({ error: "Live runs are off on this demo. Saved runs replay at no cost." }, 403);
  if (!hasLiveKeys()) return json({ error: "NEBIUS_API_KEY is not set; live runs are disabled." }, 403);
  const { caseId, profile } = (await req.json()) as { caseId?: string; profile?: string };
  const opp = caseId ? getOpportunity(caseId) : null;
  if (!opp) return json({ error: "Unknown case" }, 404);
  const pid = listProfiles().some((p) => p.id === profile) ? (profile as string) : "demo";
  const prof = loadProfile(pid);
  // The rules gate decides before any money is reserved or spent.
  if (!runGate(opp, prof, new Date()).pass) return json({ error: "This notice is blocked by the rules for this company, so no run is allowed." }, 409);

  let reservation: { reserved: number; day: string } | null = null;
  if (hosted) {
    const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
    try {
      const r = await reserveRun(ip);
      if (!r.ok) return json({ error: r.reason }, 429);
      reservation = r;
    } catch {
      return json({ error: "The live-run budget store is unavailable, so live runs are paused." }, 503);
    }
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      let spent = reservation?.reserved ?? 0; // if anything throws before we know the cost, keep the full reservation
      try {
        const memo = await runPipeline(opp, prof, undefined, undefined, (step, message) => send({ type: "step", step, message }));
        spent = memo.cost.totalUsd;
        if (hosted) {
          await saveLiveMemo(pid, opp.id, memo);
        } else {
          const p = memoPath(opp.id, pid);
          mkdirSync(dirname(p), { recursive: true });
          writeFileSync(p, JSON.stringify(memo, null, 2));
        }
        send({ type: "done", runId: memo.runId, decision: memo.verdict?.decision ?? null, costUsd: memo.cost.totalUsd, errors: memo.errors });
      } catch (e) {
        send({ type: "error", message: (e as Error).message });
      } finally {
        if (reservation) await settleRun(reservation, spent);
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
}
