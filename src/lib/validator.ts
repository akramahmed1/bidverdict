// Source validator. Sits between generation and the approval screen.
// A claim reaches a human only if every URL it cites appears in THIS run's
// evidence (Tavily results or USAspending records). A model can invent a
// plausible URL; this check is what makes "verify any line" true.

import { appendLedger } from "./ledger";

export interface Claim {
  text: string;
  kind: "fit" | "risk" | "fact";
  sourceUrls: string[];
}

export interface ValidatedClaim extends Claim {
  status: "supported";
}

export interface DroppedClaim extends Claim {
  status: "dropped";
  reason: string;
}

export function normalizeUrl(u: string): string {
  try {
    const url = new URL(u.trim());
    url.hash = "";
    // drop common tracking params
    for (const p of [...url.searchParams.keys()]) if (/^utm_|^_hs/.test(p)) url.searchParams.delete(p);
    let s = url.toString();
    if (s.endsWith("/")) s = s.slice(0, -1);
    return s.toLowerCase();
  } catch {
    return "";
  }
}

export function validateClaims(
  runId: string,
  claims: Claim[],
  evidenceUrls: string[],
  opts: { log?: boolean } = { log: true },
): { supported: ValidatedClaim[]; dropped: DroppedClaim[] } {
  const allowed = new Set(evidenceUrls.map(normalizeUrl).filter(Boolean));
  const supported: ValidatedClaim[] = [];
  const dropped: DroppedClaim[] = [];

  for (const c of claims) {
    const urls = (c.sourceUrls ?? []).map(normalizeUrl).filter(Boolean);
    let reason: string | null = null;
    if (urls.length === 0) reason = "no source attached";
    else {
      const unknown = urls.filter((u) => !allowed.has(u));
      if (unknown.length) reason = `cites URL(s) not in this run's evidence: ${unknown.join(", ")}`;
    }

    if (reason) {
      dropped.push({ ...c, status: "dropped", reason });
      if (opts.log !== false)
        appendLedger({ runId, kind: "validator_drop", detail: { claim: c.text, reason } });
    } else {
      supported.push({ ...c, status: "supported" });
    }
  }
  return { supported, dropped };
}
