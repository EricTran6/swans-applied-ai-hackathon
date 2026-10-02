import { repos } from "@/lib/db";
import { errorJson, hashIp, MAX_SHARE_BODY_BYTES, noContent, readCappedText, SHARE_HEADERS } from "@/lib/server/http";
import { findLiveShare } from "@/lib/server/shares";
import { hashToken } from "@/lib/share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIEW_DEDUPE_MS = 60 * 60 * 1000; // one recorded view per ip hash per hour

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await ctx.params;
  const s = findLiveShare(hashToken, token);
  if (!s) return errorJson(404, "not found", SHARE_HEADERS);
  if ((await readCappedText(req, MAX_SHARE_BODY_BYTES)) === null) return errorJson(413, "body too large", SHARE_HEADERS);
  const now = new Date();
  const ipHash = hashIp(req);
  const r = repos();
  if (!r.shareViews.seenSince(s.id, ipHash, new Date(now.getTime() - VIEW_DEDUPE_MS).toISOString())) {
    r.shareViews.insert(s.id, now.toISOString(), ipHash, (req.headers.get("user-agent") ?? "").slice(0, 200) || null);
  }
  return noContent(SHARE_HEADERS);
}
