import { beforeEach, describe, expect, it } from "vitest";
import { reserveRun, settleRun, loadLiveMemo, saveLiveMemo, hostedLiveEnabled, redis } from "../src/lib/liveStore";

// A tiny in-memory stand-in for Upstash's REST endpoint (INCR, DECR, INCRBYFLOAT, EXPIRE, SET, GET).
function fakeStore() {
  const m = new Map<string, string>();
  const f = (async (_url: string, init: { body: string }) => {
    const [cmd, key, a] = JSON.parse(init.body) as [string, string, string | number];
    let result: unknown = null;
    if (cmd === "INCR") { const n = Number(m.get(key) ?? 0) + 1; m.set(key, String(n)); result = n; }
    else if (cmd === "DECR") { const n = Number(m.get(key) ?? 0) - 1; m.set(key, String(n)); result = n; }
    else if (cmd === "INCRBYFLOAT") { const n = Number(m.get(key) ?? 0) + Number(a); m.set(key, String(n)); result = String(n); }
    else if (cmd === "EXPIRE") result = 1;
    else if (cmd === "SET") { m.set(key, String(a)); result = "OK"; }
    else if (cmd === "GET") result = m.get(key) ?? null;
    return { ok: true, status: 200, json: async () => ({ result }) } as Response;
  }) as unknown as typeof fetch;
  return { f, m };
}

beforeEach(() => {
  process.env.KV_REST_API_URL = "https://example.invalid";
  process.env.KV_REST_API_TOKEN = "t";
  process.env.LIVE_RUNS_PER_VISITOR = "2";
  process.env.CAP_HOSTED_DAILY_USD = "0.12";
  process.env.CAP_HOSTED_TOTAL_USD = "10";
});

describe("hosted live-run budget", () => {
  it("allows the per-visitor limit, then refuses and does not keep the reservation", async () => {
    const { f, m } = fakeStore();
    expect((await reserveRun("1.2.3.4", f)).ok).toBe(true);
    expect((await reserveRun("1.2.3.4", f)).ok).toBe(true);
    const third = await reserveRun("1.2.3.4", f);
    expect(third.ok).toBe(false);
    const day = [...m.keys()].find((k) => k.startsWith("bv:spend:20"))!;
    expect(Number(m.get(day))).toBeCloseTo(0.1); // two reservations of $0.05; the refused one was rolled back
  });
  it("stops a crowd of different visitors at the daily budget", async () => {
    const { f } = fakeStore();
    const results = [];
    for (let i = 0; i < 4; i++) results.push((await reserveRun(`10.0.0.${i}`, f)).ok);
    expect(results).toEqual([true, true, false, false]); // $0.12 daily cap fits two $0.05 reservations
  });
  it("refunds unused reservation after a run", async () => {
    const { f, m } = fakeStore();
    const r = await reserveRun("9.9.9.9", f);
    if (!r.ok) throw new Error("expected ok");
    await settleRun(r, 0.01, f);
    expect(Number(m.get(`bv:spend:${r.day}`))).toBeCloseTo(0.01);
  });
  it("never stores the raw IP address", async () => {
    const { f, m } = fakeStore();
    await reserveRun("203.0.113.7", f);
    expect([...m.keys()].some((k) => k.includes("203.0.113.7"))).toBe(false);
  });
  it("round-trips a saved live memo", async () => {
    const { f } = fakeStore();
    await saveLiveMemo("demo", "X1", { runId: "r" } as never, f);
    expect((await loadLiveMemo("demo", "X1", f)) as unknown).toEqual({ runId: "r" });
  });
  it("is off unless the switch, both keys and the store are all present", () => {
    process.env.NEBIUS_API_KEY = "a"; process.env.TAVILY_API_KEY = "b";
    delete process.env.BIDVERDICT_LIVE;
    expect(hostedLiveEnabled()).toBe(false);
    process.env.BIDVERDICT_LIVE = "1";
    expect(hostedLiveEnabled()).toBe(true);
    delete process.env.KV_REST_API_URL;
    expect(hostedLiveEnabled()).toBe(false);
  });
  it("redis() throws when no store is configured, so hosted runs fail closed", async () => {
    delete process.env.KV_REST_API_URL; delete process.env.UPSTASH_REDIS_REST_URL;
    await expect(redis(["GET", "x"])).rejects.toThrow();
  });
});
