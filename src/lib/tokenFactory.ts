// The only LLM client in the project. Every model call goes through here:
// Nebius Token Factory (OpenAI-compatible endpoint), NVIDIA Nemotron by tier.
// No other provider, not even as a fallback.

import { TIERS, TOKEN_FACTORY_BASE_URL, isMockMode, type Tier } from "./config";
import { checkBudget, costUsd, type BudgetState } from "./budget";
import { appendLedger } from "./ledger";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CallResult {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  mock: boolean;
}

export class LiveDisabledError extends Error {
  constructor() {
    super("Live runs are disabled: NEBIUS_API_KEY is not set. Replay cases still work.");
    this.name = "LiveDisabledError";
  }
}

export async function callTier(
  state: BudgetState,
  tier: Tier,
  purpose: string,
  messages: ChatMessage[],
  opts: { json?: boolean; temperature?: number } = {},
): Promise<CallResult> {
  const cfg = TIERS[tier];
  const promptText = messages.map((m) => m.content).join("\n");

  if (isMockMode()) return mockCall(state, tier, purpose, promptText);

  const key = process.env.NEBIUS_API_KEY;
  if (!key) throw new LiveDisabledError();

  checkBudget(state, tier, promptText, { live: true });

  const started = Date.now();
  const res = await fetch(`${TOKEN_FACTORY_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      max_tokens: cfg.maxTokens,
      temperature: opts.temperature ?? 0.1,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  const latencyMs = Date.now() - started;

  if (!res.ok) {
    const body = await res.text();
    appendLedger({
      runId: state.runId,
      kind: "model_call",
      tier,
      model: cfg.model,
      purpose,
      latencyMs,
      costUsd: 0,
      detail: { error: `HTTP ${res.status}`, body: body.slice(0, 300) },
    });
    throw new Error(`Token Factory ${res.status} for ${cfg.model}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const inputTokens = data.usage?.prompt_tokens ?? 0;
  const outputTokens = data.usage?.completion_tokens ?? 0;
  const cost = costUsd(tier, inputTokens, outputTokens);

  appendLedger({
    runId: state.runId,
    kind: "model_call",
    tier,
    model: cfg.model,
    purpose,
    inputTokens,
    outputTokens,
    costUsd: cost,
    latencyMs,
  });

  return {
    text: data.choices?.[0]?.message?.content ?? "",
    model: cfg.model,
    inputTokens,
    outputTokens,
    costUsd: cost,
    latencyMs,
    mock: false,
  };
}

// Developer-only fixture client (BIDVERDICT_MOCK=1). The UI shows MOCK when on.
function mockCall(state: BudgetState, tier: Tier, purpose: string, promptText: string): CallResult {
  const cfg = TIERS[tier];
  const inputTokens = Math.ceil(promptText.length / 3.5);
  const outputTokens = 50;
  appendLedger({
    runId: state.runId,
    kind: "model_call",
    tier,
    model: `MOCK:${cfg.model}`,
    purpose,
    inputTokens,
    outputTokens,
    costUsd: 0,
    latencyMs: 0,
    detail: { mock: true },
  });
  return {
    text: JSON.stringify({ mock: true, tier, purpose }),
    model: `MOCK:${cfg.model}`,
    inputTokens,
    outputTokens,
    costUsd: 0,
    latencyMs: 0,
    mock: true,
  };
}
