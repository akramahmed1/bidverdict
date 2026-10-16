// Single source of truth for model tiers, prices and caps.
// Prices: per 1M tokens, as shown in the Nebius Token Factory console on 2026-10-15.
// Model IDs: display names from the console. Confirm the exact API IDs with
// `npm run models` on day one and override via MODEL_* env vars if they differ.

export type Tier = "nano" | "super" | "ultra";

export interface TierConfig {
  tier: Tier;
  model: string;
  job: string;
  priceInPerM: number;
  priceOutPerM: number;
  maxTokens: number; // hard output cap; also used for the worst-case budget check
}

const env = (k: string) => (typeof process !== "undefined" ? process.env[k] : undefined);

export const TIERS: Record<Tier, TierConfig> = {
  nano: {
    tier: "nano",
    model: env("MODEL_NANO") || "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B",
    job: "fast classification and field extraction",
    priceInPerM: 0.06,
    priceOutPerM: 0.24,
    maxTokens: 1200,
  },
  super: {
    tier: "super",
    model: env("MODEL_SUPER") || "nvidia/nemotron-3-super-120b-a12b",
    job: "research synthesis over sourced evidence",
    priceInPerM: 0.3,
    priceOutPerM: 0.9,
    maxTokens: 3000,
  },
  ultra: {
    tier: "ultra",
    model: env("MODEL_ULTRA") || "nvidia/Nemotron-3-Ultra-550b-a55b",
    job: "final bid / no-bid verdict reasoning only",
    priceInPerM: 1.0,
    priceOutPerM: 3.0,
    maxTokens: 3000,
  },
};

export const TOKEN_FACTORY_BASE_URL = "https://api.tokenfactory.nebius.com/v1";
export const TAVILY_BASE_URL = "https://api.tavily.com";
export const USASPENDING_BASE_URL = "https://api.usaspending.gov";

const num = (k: string, d: number) => {
  const v = env(k);
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : d;
};

// Set from the measured memo (BUDGET.md, 2026-10-16). BUDGET.md records the real numbers.
export const CAPS = {
  perRunUsd: num("CAP_PER_RUN_USD", 0.05),
  dailyLiveUsd: num("CAP_DAILY_LIVE_USD", 2.0),
  globalUsd: num("CAP_GLOBAL_USD", 40.0), // below the $50 credit balance
  maxLoops: num("MAX_LOOPS", 8),
};

export const isMockMode = () => env("BIDVERDICT_MOCK") === "1";
export const hasLiveKeys = () => Boolean(env("NEBIUS_API_KEY"));
