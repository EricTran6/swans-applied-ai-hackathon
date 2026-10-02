// AI share flags (Haiku, enum output). A flag can only LOWER inclusion: `review` and `block` both set
// included=false (the attorney may re-tick a `review` item; `block`/hardDeny cannot be re-ticked by the
// view builder anyway). On any error the keyword tripwire runs instead. Never raises inclusion.
import type { AiCall, ShareCandidate } from "@/lib/types";

export const KEYWORD_RE = /\b(settle\w*|offer\w*|demand\w*|strateg\w*|privileged|valuation|lien|liens|credibility|IME)\b/i;

export type FlagLevel = "ok" | "review" | "block";
export interface FlagResult { id: string; level: FlagLevel; reason: string }

/** Minimal slice of the Anthropic SDK client so tests can inject a mock. */
export interface FlagClient {
  messages: {
    create(params: { model: string; max_tokens: number; system?: string; messages: { role: "user"; content: string }[] }): Promise<{
      content: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number | null };
    }>;
  };
}

export const FLAG_SYSTEM = [
  "You review items a personal-injury law firm is about to share with a treating medical provider.",
  "For each item decide if the text could reveal case valuation, settlement/offers/demands, legal strategy, liability analysis,",
  "other liens or other providers' bills, client financial or identity details, or anything an attorney would consider privileged.",
  "Answer ONLY with a JSON array of objects {\"id\": string, \"level\": \"ok\"|\"review\"|\"block\", \"reason\": string (<= 12 words)}.",
  "Use \"block\" for clear leaks, \"review\" when unsure, \"ok\" otherwise. Never add items that were not given.",
].join(" ");

function applyDowngrade(c: ShareCandidate, level: FlagLevel, reason: string): ShareCandidate {
  if (level === "ok") return { ...c, flag: c.flag ?? { level: "ok", reason } };
  return { ...c, included: false, flag: { level, reason } };
}

/** Deterministic fallback: internal vocabulary in the label/preview downgrades to `review`. */
export function keywordDowngrade(candidates: ShareCandidate[]): ShareCandidate[] {
  return candidates.map((c) => {
    if (c.hardDeny || !c.included) return c;
    const m = KEYWORD_RE.exec(`${c.label} ${c.preview}`);
    return m ? applyDowngrade(c, "review", `Contains "${m[1].toLowerCase()}"`) : c;
  });
}

function parseFlags(text: string, allowed: Set<string>): FlagResult[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) throw new Error("no JSON array in model output");
  const arr: unknown = JSON.parse(text.slice(start, end + 1));
  if (!Array.isArray(arr)) throw new Error("model output is not an array");
  const out: FlagResult[] = [];
  for (const row of arr) {
    if (!row || typeof row !== "object") continue;
    const { id, level, reason } = row as Record<string, unknown>;
    if (typeof id !== "string" || !allowed.has(id)) continue;
    if (level !== "ok" && level !== "review" && level !== "block") continue;
    out.push({ id, level, reason: typeof reason === "string" ? reason.slice(0, 200) : "" });
  }
  return out;
}

export interface FlagOptions { client: FlagClient; model?: string; matterId?: string | null; log?: (c: AiCall) => void }

/** Review the currently-included, non-hard-deny candidates. Output can only exclude or annotate. */
export async function flagCandidates(candidates: ShareCandidate[], opts: FlagOptions): Promise<ShareCandidate[]> {
  const reviewable = candidates.filter((c) => c.included && !c.hardDeny);
  if (reviewable.length === 0) return candidates;
  const model = opts.model ?? process.env.MODEL_EXTRACT ?? "claude-haiku-4-5";
  try {
    const payload = reviewable.map((c) => ({ id: c.id, category: c.category, label: c.label, text: c.preview }));
    const res = await opts.client.messages.create({
      model, max_tokens: 1024, system: FLAG_SYSTEM,
      messages: [{ role: "user", content: `Items:\n${JSON.stringify(payload)}` }],
    });
    const text = res.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
    const flags = parseFlags(text, new Set(reviewable.map((c) => c.id)));
    if (opts.log) {
      const u = res.usage ?? {};
      opts.log({ matterId: opts.matterId ?? null, stage: "share_flags", model, inputTokens: u.input_tokens ?? 0,
        outputTokens: u.output_tokens ?? 0, cacheReadTokens: u.cache_read_input_tokens ?? 0,
        usd: ((u.input_tokens ?? 0) * 1 + (u.output_tokens ?? 0) * 5) / 1_000_000 });
    }
    const byId = new Map(flags.map((f) => [f.id, f]));
    return candidates.map((c) => {
      const f = byId.get(c.id);
      if (!f || c.hardDeny || !c.included) return c; // can never raise
      return applyDowngrade(c, f.level, f.reason);
    });
  } catch {
    return keywordDowngrade(candidates);
  }
}
