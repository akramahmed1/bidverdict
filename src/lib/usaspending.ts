// Award history from USAspending.gov (free, no key). Ported from the author's
// earlier public project akramahmed1/firstwin (govcon_feed.py, Sept-Oct 2026),
// including its field-name findings verified against the live API on 2026-10-09:
//   - v2 search silently ignores `business_categories` / `recipient_type_names`
//   - valid fields/sort keys are "Base Obligation Date", "Description",
//     "pop_city_name", "pop_state_code", etc. (not the display names)
//   - small-business targeting works via set_aside_type_codes
//
// New for BidVerdict: history is scoped to ONE opportunity (agency + NAICS), to
// show who has won similar work, at what size, and how often small firms win it.

import { USASPENDING_BASE_URL } from "./config";
import { appendLedger } from "./ledger";

const SEARCH = `${USASPENDING_BASE_URL}/api/v2/search/spending_by_award/`;
const CONTRACT_CODES = ["A", "B", "C", "D"];
export const SMALL_BIZ_SET_ASIDES = ["SBA", "8A", "8AN", "HZC", "HZS", "WOSB", "EDWOSB", "SDVOSBC", "SDVOSBS", "LAS"];

const FIELDS = [
  "Award ID",
  "Recipient Name",
  "Award Amount",
  "Awarding Agency",
  "Awarding Sub Agency",
  "Description",
  "Base Obligation Date",
  "pop_state_code",
  "naics_code",
  "generated_internal_id",
];

export interface AwardRecord {
  awardId: string;
  recipient: string;
  amount: number;
  agency: string;
  subAgency?: string;
  description: string;
  date: string;
  popState?: string;
  url: string; // public award page, usable as a claim source
}

export interface AwardHistory {
  agency: string;
  naics: string;
  years: number;
  total: number;
  awards: AwardRecord[];
  smallBizAwards: number; // awards carrying a small-business set-aside code
  medianAmount: number | null;
  topRecipients: { name: string; count: number; amount: number }[];
}

async function post(body: unknown) {
  const res = await fetch(SEARCH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`USAspending HTTP ${res.status}`);
  return (await res.json()) as { results: Record<string, unknown>[] };
}

const COUNT = `${USASPENDING_BASE_URL}/api/v2/search/spending_by_award_count/`;

async function count(filters: Record<string, unknown>): Promise<number> {
  const res = await fetch(COUNT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filters }),
  });
  if (!res.ok) throw new Error(`USAspending count HTTP ${res.status}`);
  const data = (await res.json()) as { results?: { contracts?: number } };
  return data.results?.contracts ?? 0;
}

function toRecord(r: Record<string, unknown>): AwardRecord {
  const gid = String(r["generated_internal_id"] ?? "");
  return {
    awardId: String(r["Award ID"] ?? ""),
    recipient: String(r["Recipient Name"] ?? ""),
    amount: Number(r["Award Amount"] ?? 0),
    agency: String(r["Awarding Agency"] ?? ""),
    subAgency: r["Awarding Sub Agency"] ? String(r["Awarding Sub Agency"]) : undefined,
    description: String(r["Description"] ?? ""),
    date: String(r["Base Obligation Date"] ?? ""),
    popState: r["pop_state_code"] ? String(r["pop_state_code"]) : undefined,
    url: gid ? `https://www.usaspending.gov/award/${encodeURIComponent(gid)}` : "",
  };
}

export async function awardHistory(
  runId: string,
  agency: string,
  naics: string,
  opts: { years?: number; limit?: number; now?: Date; subtier?: string } = {},
): Promise<AwardHistory> {
  const years = opts.years ?? 5;
  const now = opts.now ?? new Date();
  const end = now.toISOString().slice(0, 10);
  const start = new Date(now.getTime() - years * 365 * 864e5).toISOString().slice(0, 10);
  const baseFilters = {
    award_type_codes: CONTRACT_CODES,
    time_period: [{ start_date: start, end_date: end }],
    agencies: [
      { type: "awarding", tier: "toptier", name: agency },
      ...(opts.subtier ? [{ type: "awarding", tier: "subtier", name: opts.subtier }] : []),
    ],
    naics_codes: [naics],
  };
  const query = (filters: Record<string, unknown>) => ({
    filters,
    fields: FIELDS,
    sort: "Award Amount",
    order: "desc",
    limit: opts.limit ?? 50,
    page: 1,
  });

  const started = Date.now();
  const all = await post(query(baseFilters));
  const totalCount = await count(baseFilters);
  const smallCount = await count({ ...baseFilters, set_aside_type_codes: SMALL_BIZ_SET_ASIDES });
  const latencyMs = Date.now() - started;

  const awards = (all.results ?? []).map(toRecord).filter((a) => a.awardId);
  const amounts = awards.map((a) => a.amount).sort((a, b) => a - b);
  const medianAmount = amounts.length ? amounts[Math.floor(amounts.length / 2)] : null;

  const byRecipient = new Map<string, { count: number; amount: number }>();
  for (const a of awards) {
    const cur = byRecipient.get(a.recipient) ?? { count: 0, amount: 0 };
    byRecipient.set(a.recipient, { count: cur.count + 1, amount: cur.amount + a.amount });
  }
  const topRecipients = [...byRecipient.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  const history: AwardHistory = {
    agency,
    naics,
    years,
    total: totalCount,
    awards,
    smallBizAwards: smallCount,
    medianAmount,
    topRecipients,
  };

  appendLedger({
    runId,
    kind: "tool_call",
    latencyMs,
    detail: { tool: "usaspending.awardHistory", agency, naics, years, total: totalCount, smallBiz: smallCount, fetched: awards.length },
  });
  return history;
}
