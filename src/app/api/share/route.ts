import { randomUUID } from "node:crypto";
import { z } from "zod";
import { repos } from "@/lib/db";
import { errorJson, json, logError, parseBody } from "@/lib/server/http";
import { buildShareSummaries } from "@/lib/server/shares";
import { buildCandidates, buildProviderView, DEFAULT_PRESET, newShareToken } from "@/lib/share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Synthetic id: the attorney's coverage-limits toggle. Passed through unchanged; the share lib decides its meaning. */
const SYNTHETIC_IDS = ["coverage:limits"];

const Body = z.object({
  matterId: z.string().min(1).max(64), recipientLabel: z.string().min(1).max(200),
  recipientContactId: z.string().max(64).nullish(),
  includedIds: z.array(z.string().min(1).max(200)).max(1000),
  attorneyNote: z.string().max(1000).nullish(),
  expiresInDays: z.number().int().min(1).max(90).optional(),
});

export async function POST(req: Request): Promise<Response> {
  const p = await parseBody(req, Body);
  if ("error" in p) return p.error;
  const b = p.data;
  const r = repos();
  const digest = r.digests.latest(b.matterId);
  if (!digest) return errorJson(409, "no digest for matter");
  try {
    const records = r.items.records(b.matterId);
    const contactId = b.recipientContactId ?? null;
    const candidates = buildCandidates(digest, records, contactId, DEFAULT_PRESET);
    // Fail closed: only ids the candidate builder offered (and not hard-denied) can be shared.
    const allowed = new Set(candidates.filter((c) => !c.hardDeny).map((c) => c.id));
    const includedIds = [...new Set(b.includedIds)].filter((id) => allowed.has(id) || SYNTHETIC_IDS.includes(id));
    const sharedCount = includedIds.filter((id) => allowed.has(id)).length;
    const now = new Date();
    const ttl = b.expiresInDays ?? (Number(process.env.SHARE_TTL_DAYS) || 7);
    const expiresAt = new Date(now.getTime() + ttl * 86400000).toISOString();
    const view = buildProviderView(digest, records, includedIds, { label: b.recipientLabel, contactId }, b.attorneyNote ?? null, now);
    view.sharedAt = now.toISOString();
    view.expiresAt = expiresAt;
    const { token, tokenHash } = newShareToken();
    const id = randomUUID();
    r.shares.insert({
      id, matterId: b.matterId, tokenHash, recipientLabel: b.recipientLabel, recipientContactId: contactId,
      presetJson: JSON.stringify(DEFAULT_PRESET), includedIdsJson: JSON.stringify(includedIds), payloadJson: JSON.stringify(view),
      attorneyNote: b.attorneyNote ?? null, sharedCount, withheldCount: Math.max(0, candidates.length - sharedCount),
      digestVersion: digest.version, createdAt: now.toISOString(), expiresAt, revokedAt: null,
    });
    const base = (process.env.APP_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
    return json({ shareId: id, url: `${base}/s/${token}`, expiresAt }, 201, { "Cache-Control": "no-store" });
  } catch (err) {
    logError("share.create", err);
    return errorJson(500, "could not create share");
  }
}

export async function GET(req: Request): Promise<Response> {
  const matterId = new URL(req.url).searchParams.get("matterId");
  if (!matterId) return errorJson(400, "matterId required");
  return json({ shares: buildShareSummaries(matterId) });
}
