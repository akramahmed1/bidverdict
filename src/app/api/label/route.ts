import { NextResponse } from "next/server";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getHostedMode } from "@/lib/mode";

export const dynamic = "force-dynamic";

// POST /api/label { id, label, note, labeler } writes data/eval/labels.json. Local only.
export async function POST(req: Request) {
  if (getHostedMode()) return NextResponse.json({ error: "Labeling is local only." }, { status: 403 });
  const b = (await req.json()) as { id?: string; label?: string; note?: string; labeler?: string };
  if (!b.id || !["BID", "NO_BID", "CONDITIONAL"].includes(b.label ?? "")) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const f = join(process.cwd(), "data", "eval", "labels.json");
  mkdirSync(join(process.cwd(), "data", "eval"), { recursive: true });
  const cur = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : { labeler: "", labels: {} };
  if (b.labeler) cur.labeler = b.labeler;
  cur.labels[b.id] = { label: b.label, note: (b.note ?? "").slice(0, 500), at: new Date().toISOString() };
  writeFileSync(f, JSON.stringify(cur, null, 2));
  return NextResponse.json({ ok: true });
}
