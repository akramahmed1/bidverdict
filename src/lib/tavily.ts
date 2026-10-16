// Tavily runtime research. Every result becomes a Source with a stable id; the
// source validator only accepts claim URLs that appear in THIS run's sources.

import { TAVILY_BASE_URL } from "./config";
import { appendLedger } from "./ledger";

export interface Source {
  id: string; // e.g. "S1"
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
  query: string;
}

export async function tavilySearch(
  runId: string,
  query: string,
  opts: { maxResults?: number; startIndex?: number } = {},
): Promise<Source[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error("TAVILY_API_KEY is not set. Live research is disabled; replay cases still work.");

  const started = Date.now();
  const res = await fetch(`${TAVILY_BASE_URL}/search`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, max_results: opts.maxResults ?? 5, search_depth: "basic" }),
  });
  const latencyMs = Date.now() - started;

  if (!res.ok) {
    appendLedger({ runId, kind: "tool_call", detail: { tool: "tavily.search", query, error: `HTTP ${res.status}`, latencyMs } });
    throw new Error(`Tavily search failed: HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    results: { title: string; url: string; content: string; published_date?: string }[];
  };
  const start = opts.startIndex ?? 1;
  const sources = (data.results ?? []).map((r, i) => ({
    id: `S${start + i}`,
    title: r.title,
    url: r.url,
    snippet: r.content?.slice(0, 500) ?? "",
    publishedDate: r.published_date,
    query,
  }));

  appendLedger({
    runId,
    kind: "tool_call",
    latencyMs,
    detail: { tool: "tavily.search", query, results: sources.length, urls: sources.map((s) => s.url) },
  });
  return sources;
}
