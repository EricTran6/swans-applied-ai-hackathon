// Live preview of exactly what one provider would see. Same body and validation as POST /api/share,
// but nothing is persisted, no token is minted and the response is never cached. Clio is not touched.
import { z } from "zod";
import { repos } from "@/lib/db";
import { errorJson, json, logError, parseAttorneyBody } from "@/lib/server/http";
import { buildCandidates, buildProviderView, DEFAULT_PRESET } from "@/lib/share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Synthetic id: the attorney's coverage-limits toggle (same id the create route passes through). */
const COVERAGE_LIMITS_ID = "coverage:limits";
const NO_STORE = { "Cache-Control": "no-store" };

const Body = z.object({
  matterId: z.string().min(1).max(64), recipientLabel: z.string().min(1).max(200),
  recipientContactId: z.string().max(64).nullish(),
  includedIds: z.array(z.string().min(1).max(200)).max(1000),
  attorneyNote: z.string().max(1000).nullish(),
  coverageLimits: z.boolean().optional(),
  expiresInDays: z.number().int().min(1).max(90).optional(),
});

export async function POST(req: Request): Promise<Response> {
  const p = await parseAttorneyBody(req, Body);
  if ("error" in p) return p.error;
  const b = p.data;
  const r = repos();
  const digest = r.digests.latest(b.matterId);
  if (!digest) return errorJson(409, "no digest for matter", NO_STORE);
  try {
    const records = r.items.records(b.matterId);
    const contactId = b.recipientContactId ?? null;
    const candidates = buildCandidates(digest, records, contactId, DEFAULT_PRESET);
    // Fail closed: only offered, non-hard-deny ids in a preset category can appear in the preview.
    const preset = new Set<string>([...DEFAULT_PRESET.allow, ...DEFAULT_PRESET.optIn]);
    const allowed = new Set(candidates.filter((c) => !c.hardDeny && preset.has(c.category)).map((c) => c.id));
    const ids = [...new Set(b.includedIds)].filter((id) => allowed.has(id));
    if (b.coverageLimits || b.includedIds.includes(COVERAGE_LIMITS_ID)) ids.push(COVERAGE_LIMITS_ID);
    const note = b.attorneyNote?.trim() || null;
    const view = buildProviderView(digest, records, ids, { label: b.recipientLabel, contactId }, note, new Date());
    return json(view, 200, NO_STORE);
  } catch (err) {
    logError("share.preview", err);
    return errorJson(500, "could not build preview", NO_STORE);
  }
}
