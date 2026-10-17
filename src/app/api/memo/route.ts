import { listProfiles, loadMemo } from "@/lib/cases";
import { memoToMarkdown } from "@/lib/exportMemo";
import { getHostedMode } from "@/lib/mode";
import { loadLiveMemo } from "@/lib/liveStore";

export const dynamic = "force-dynamic";

// GET /api/memo?id=<opportunity>&profile=<company>  Download a saved memo as markdown.
export async function GET(req: Request) {
  const u = new URL(req.url);
  const id = u.searchParams.get("id") ?? "";
  const profile = u.searchParams.get("profile") ?? "demo";
  const pid = listProfiles().some((p) => p.id === profile) ? profile : "demo";
  const memo = (getHostedMode() ? await loadLiveMemo(pid, id) : null) ?? loadMemo(id, pid);
  if (!memo) return new Response("No saved memo for that notice and company.", { status: 404 });
  const name = `bidverdict-${pid}-${id}`.replace(/[^a-z0-9-_]/gi, "_") + ".md";
  return new Response(memoToMarkdown(memo), {
    headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="${name}"` },
  });
}
