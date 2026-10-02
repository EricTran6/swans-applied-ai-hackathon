// Thin wrapper over the Anthropic SDK: structured JSON output, refusal retry, cost logging.
// Every call goes through callJson() so cost is logged exactly once per request.
import Anthropic from "@anthropic-ai/sdk";
import type { AiCall } from "@/lib/types";

export const DEFAULT_MODELS = {
  extract: "claude-haiku-4-5",
  synth: "claude-sonnet-5-5",
  scan: "claude-sonnet-5-5",
} as const;

export function models(): { extract: string; synth: string; scan: string } {
  return {
    extract: process.env.MODEL_EXTRACT || DEFAULT_MODELS.extract,
    synth: process.env.MODEL_SYNTH || DEFAULT_MODELS.synth,
    scan: process.env.MODEL_SCAN || DEFAULT_MODELS.scan,
  };
}

// USD per 1M tokens. Keyed by model-id prefix; first matching prefix wins.
export const PRICES: { prefix: string; input: number; output: number; cacheRead: number }[] = [
  { prefix: "claude-haiku-4-5", input: 1, output: 5, cacheRead: 0.1 },
  { prefix: "claude-sonnet-5-5", input: 2, output: 10, cacheRead: 0.2 },
  { prefix: "claude-sonnet-5", input: 2, output: 10, cacheRead: 0.2 },
  { prefix: "claude-sonnet-4-6", input: 3, output: 15, cacheRead: 0.3 },
  { prefix: "claude-opus-5-5", input: 4, output: 20, cacheRead: 0.2 },
  { prefix: "claude-opus-5", input: 5, output: 25, cacheRead: 0.5 },
  { prefix: "claude-opus-4", input: 5, output: 25, cacheRead: 0.5 },
];
const FALLBACK_PRICE = { input: 2, output: 10, cacheRead: 0.2 };

export function priceUsd(model: string, inputTokens: number, outputTokens: number, cacheReadTokens: number): number {
  const p = PRICES.find((x) => model.startsWith(x.prefix)) ?? FALLBACK_PRICE;
  return (inputTokens * p.input + outputTokens * p.output + cacheReadTokens * p.cacheRead) / 1_000_000;
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export interface JsonCallInput {
  stage: string;
  model: string;
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
  matterId: string | null;
  log: (c: AiCall) => void;
}
export interface JsonCallResult<T> { data: T | null; warning: string | null }

/**
 * One structured-output request. Retries once on refusal or unparseable output, then degrades
 * (data: null + warning). Never throws on model behaviour; SDK/network errors are caught too so a
 * single bad call cannot take the whole digest down.
 */
export async function callJson<T>(input: JsonCallInput): Promise<JsonCallResult<T>> {
  let warning: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Anthropic.Message;
    try {
      res = await getClient().messages.create({
        model: input.model,
        max_tokens: input.maxTokens ?? 8000,
        system: input.system,
        messages: [{ role: "user", content: input.user }],
        output_config: { format: { type: "json_schema", schema: input.schema } },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warning = `${input.stage}: API error (${msg})`;
      if (err instanceof Anthropic.APIError && err.status !== undefined && err.status < 500 && err.status !== 429) break;
      continue;
    }
    const u = res.usage;
    const cacheRead = u.cache_read_input_tokens ?? 0;
    input.log({
      matterId: input.matterId, stage: input.stage, model: res.model || input.model,
      inputTokens: u.input_tokens, outputTokens: u.output_tokens, cacheReadTokens: cacheRead,
      usd: priceUsd(res.model || input.model, u.input_tokens, u.output_tokens, cacheRead),
    });
    if (res.stop_reason === "refusal") { warning = `${input.stage}: model refused`; continue; }
    if (res.stop_reason === "max_tokens") { warning = `${input.stage}: output truncated (max_tokens)`; continue; }
    const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    try {
      return { data: JSON.parse(text) as T, warning: null };
    } catch {
      warning = `${input.stage}: unparseable JSON output`;
    }
  }
  return { data: null, warning: warning ?? `${input.stage}: no output` };
}

// Shared JSON-schema fragments (structured outputs want closed objects).
export const LLM_REF_SCHEMA = {
  type: "object", additionalProperties: false, required: ["id", "quote"],
  properties: { id: { type: "string" }, quote: { type: ["string", "null"] } },
} as const;
export const CLAIM_SCHEMA = {
  type: "object", additionalProperties: false, required: ["text", "refs"],
  properties: { text: { type: "string" }, refs: { type: "array", items: LLM_REF_SCHEMA } },
} as const;

/** Rough token estimate for budgeting prompt size (~4 chars/token). */
export function approxTokens(s: string): number { return Math.ceil(s.length / 4); }
