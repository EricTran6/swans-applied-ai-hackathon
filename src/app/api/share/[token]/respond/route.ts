import { randomUUID } from "node:crypto";
import { z } from "zod";
import { repos } from "@/lib/db";
import { errorJson, noContent, parseBody, SHARE_HEADERS } from "@/lib/server/http";
import { findLiveShare } from "@/lib/server/shares";
import { hashToken } from "@/lib/share";
import type { ProviderView } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const p = await parseBody(req, Body);
  if ("error" in p) return errorJson(400, "invalid request", SHARE_HEADERS);
  const b = p.data;
  if (b.needId) {
    const view = JSON.parse(s.payloadJson) as ProviderView;
    if (!view.needs.some((n) => n.id === b.needId)) return errorJson(400, "invalid request", SHARE_HEADERS);
  }
  repos().shareResponses.insert({
    id: randomUUID(), shareId: s.id, needId: b.needId ?? null, kind: b.kind,
    promisedDate: b.promisedDate ?? null, text: b.text ?? null, createdAt: new Date().toISOString(),
  });
  return noContent(SHARE_HEADERS);
}
