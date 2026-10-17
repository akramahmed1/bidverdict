// Shared state for hosted live runs: spend reserve, per-visitor limit and saved live memos.
// Backed by Upstash Redis over its REST API (Vercel's Storage tab provisions it and sets
// KV_REST_API_URL / KV_REST_API_TOKEN, or UPSTASH_REDIS_REST_URL / _TOKEN).
//
// Serverless instances share nothing, so a spend counter kept in process memory cannot
// stop a crowd of visitors. Everything that limits spend therefore lives here, and
// hosted live runs FAIL CLOSED: no store configured means no live runs.

import { createHash } from "node:crypto";
import { CAPS } from "./config";
import type { Memo } from "./pipeline";

type Fetch = typeof fetch;
const env = (k: string) => process.env[k];

export const storeConfig = () => {
  const url = env("KV_REST_API_URL") || env("UPSTASH_REDIS_REST_URL");
  const token = env("KV_REST_API_TOKEN") || env("UPSTASH_REDIS_REST_TOKEN");
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
};

export const liveRuns = {
  perVisitorPerDay: () => Number(env("LIVE_RUNS_PER_VISITOR") || 3),
  dailyUsd: () => Number(env("CAP_HOSTED_DAILY_USD") || 1.5),
  totalUsd: () => Number(env("CAP_HOSTED_TOTAL_USD") || 8),
};

// Hosted live runs are on only when the owner turns the switch on AND everything they need exists.
export function hostedLiveEnabled(): boolean {
  return env("BIDVERDICT_LIVE") === "1" && Boolean(env("NEBIUS_API_KEY")) && Boolean(env("TAVILY_API_KEY")) && storeConfig() !== null;
}

export async function redis(cmd: (string | number)[], f: Fetch = fetch): Promise<unknown> {
  const c = storeConfig();
  if (!c) throw new Error("Live-run store is not configured.");
  const r = await f(c.url, {
    method: "POST",
    headers: { authorization: `Bearer ${c.token}`, "content-type": "application/json" },
    body: JSON.stringify(cmd),
    cache: "no-store",
  });
  const j = (await r.json()) as { result?: unknown; error?: string };
  if (!r.ok || j.error) throw new Error(j.error ?? `store HTTP ${r.status}`);
  return j.result;
}

const today = () => new Date().toISOString().slice(0, 10);
export const visitorKey = (ip: string) => createHash("sha256").update(`bv:${ip}`).digest("hex").slice(0, 24);

export type Reservation = { ok: true; reserved: number; day: string } | { ok: false; reason: string };

// Reserve the worst-case cost of one run BEFORE it starts. Refund the unused part after.
export async function reserveRun(ip: string, f: Fetch = fetch): Promise<Reservation> {
  const reserve = CAPS.perRunUsd;
  const day = today();
  const dayKey = `bv:spend:${day}`;
  const totalKey = "bv:spend:total";
  const visitor = `bv:visits:${day}:${visitorKey(ip)}`;
  const rollback = async (v: boolean, d: boolean, t: boolean) => {
    if (v) await redis(["DECR", visitor], f).catch(() => {});
    if (d) await redis(["INCRBYFLOAT", dayKey, -reserve], f).catch(() => {});
    if (t) await redis(["INCRBYFLOAT", totalKey, -reserve], f).catch(() => {});
  };

  const visits = Number(await redis(["INCR", visitor], f));
  if (visits === 1) await redis(["EXPIRE", visitor, 172800], f);
  if (visits > liveRuns.perVisitorPerDay()) {
    await rollback(true, false, false);
    return { ok: false, reason: `Live-run limit reached (${liveRuns.perVisitorPerDay()} per visitor per day). Saved runs replay at no cost.` };
  }
  const dayTotal = Number(await redis(["INCRBYFLOAT", dayKey, reserve], f));
  if (dayTotal > liveRuns.dailyUsd()) {
    await rollback(true, true, false);
    return { ok: false, reason: "Today's live-run budget for this demo is used up. Saved runs replay at no cost; try again tomorrow." };
  }
  const allTotal = Number(await redis(["INCRBYFLOAT", totalKey, reserve], f));
  if (allTotal > liveRuns.totalUsd()) {
    await rollback(true, true, true);
    return { ok: false, reason: "The demo's live-run budget is used up. Saved runs replay at no cost." };
  }
  await redis(["EXPIRE", dayKey, 172800], f);
  return { ok: true, reserved: reserve, day };
}

export async function settleRun(res: { reserved: number; day: string }, actualUsd: number, f: Fetch = fetch): Promise<void> {
  const refund = Math.max(0, res.reserved - actualUsd);
  if (refund <= 0) return;
  await redis(["INCRBYFLOAT", `bv:spend:${res.day}`, -refund], f).catch(() => {});
  await redis(["INCRBYFLOAT", "bv:spend:total", -refund], f).catch(() => {});
}

// Live memos survive for a week so the case page can show them after the run.
const memoKey = (pid: string, id: string) => `bv:memo:${pid}:${id}`;
export async function saveLiveMemo(pid: string, id: string, memo: Memo, f: Fetch = fetch): Promise<void> {
  await redis(["SET", memoKey(pid, id), JSON.stringify(memo), "EX", 604800], f);
}
export async function loadLiveMemo(pid: string, id: string, f: Fetch = fetch): Promise<Memo | null> {
  if (!storeConfig()) return null;
  try {
    const raw = await redis(["GET", memoKey(pid, id)], f);
    return typeof raw === "string" ? (JSON.parse(raw) as Memo) : null;
  } catch {
    return null;
  }
}
