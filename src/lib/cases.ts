// File-backed cases: real opportunities (data/opportunities), the company profile
// (data/profile.json) and saved memos (data/memos). Committed memos are what the hosted
// demo replays at $0. Read-only here; live runs write memos locally via the run script/API.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CompanyProfile, Opportunity } from "./gate";
import type { Memo } from "./pipeline";

const root = () => process.cwd();
const readJson = <T,>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;

export const DEFAULT_PROFILE = "demo";

export function listProfiles(): { id: string; profile: CompanyProfile }[] {
  const dir = join(root(), "data", "profiles");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ id: f.replace(/\.json$/, ""), profile: readJson<CompanyProfile>(join(dir, f)) }));
}

export function loadProfile(id: string = DEFAULT_PROFILE): CompanyProfile {
  const p = join(root(), "data", "profiles", `${id.replace(/[^a-z0-9-]/gi, "")}.json`);
  return existsSync(p) ? readJson<CompanyProfile>(p) : readJson<CompanyProfile>(join(root(), "data", "profiles", `${DEFAULT_PROFILE}.json`));
}

export function listOpportunities(): Opportunity[] {
  const dir = join(root(), "data", "opportunities");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson<Opportunity>(join(dir, f)))
    .sort((a, b) => a.responseDeadline.localeCompare(b.responseDeadline));
}

export function getOpportunity(id: string): Opportunity | null {
  return listOpportunities().find((o) => o.id === id) ?? null;
}

export const memoPath = (id: string, pid: string = DEFAULT_PROFILE) =>
  join(root(), "data", "memos", pid.replace(/[^a-z0-9-]/gi, ""), `${id}.json`);

export function loadMemo(id: string, pid: string = DEFAULT_PROFILE): Memo | null {
  const p = memoPath(id, pid);
  return existsSync(p) ? readJson<Memo>(p) : null;
}
