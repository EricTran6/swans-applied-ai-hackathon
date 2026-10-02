import { randomUUID } from "node:crypto";
import { z } from "zod";
import { repos } from "@/lib/db";
import { errorJson, MAX_SHARE_BODY_BYTES, noContent, parseBody, SHARE_HEADERS } from "@/lib/server/http";
import { findLiveShare } from "@/lib/server/shares";
import { hashToken } from "@/lib/share";
import type { ProviderView } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RESPONSES_PER_SHARE = 50;

const Body = z.object({
  needId: z.string().max(200).optional(),
  kind: z.enum(["sent", "will_send", "note"]),
  promisedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/).max(32).optional(),
  text: z.string().max(1000).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await ctx.params;
  const s = findLiveShare(hashToken, token);
  if (!s) return errorJson(404, "not found", SHARE_HEADERS);
  const p = await parseBody(req, Body, { maxBytes: MAX_SHARE_BODY_BYTES, headers: SHARE_HEADERS });
  if ("error" in p) return p.error;
  const b = p.data;
  const r = repos();
  if (r.shareResponses.countByShare(s.id) >= MAX_RESPONSES_PER_SHARE) return errorJson(429, "too many responses", SHARE_HEADERS);
  let needId: string | null = null;
  if (b.needId) {
    const view = JSON.parse(s.payloadJson) as ProviderView;
    if (!view.needs.some((n) => n.id === b.needId)) return errorJson(400, "invalid request", SHARE_HEADERS);
    needId = needMapOf(s.presetJson)[b.needId] ?? b.needId; // opaque "need-N" -> internal task id
  }
  r.shareResponses.insert({
    id: randomUUID(), shareId: s.id, needId, kind: b.kind,
    promisedDate: b.promisedDate ?? null, text: b.text ?? null, createdAt: new Date().toISOString(),
  });
  return noContent(SHARE_HEADERS);
}

/** The server-side need-id map stored with the share (absent on shares created before opaque ids). */
function needMapOf(presetJson: string): Record<string, string> {
  try {
    const m = (JSON.parse(presetJson) as { needMap?: unknown }).needMap;
    return m && typeof m === "object" ? (m as Record<string, string>) : {};
  } catch {
    return {};
  }
}
