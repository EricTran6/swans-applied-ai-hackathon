import { repos } from "@/lib/db";
import { errorJson, hashIp, noContent, SHARE_HEADERS } from "@/lib/server/http";
import { findLiveShare } from "@/lib/server/shares";
import { hashToken } from "@/lib/share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await ctx.params;
  const s = findLiveShare(hashToken, token);
  if (!s) return errorJson(404, "not found", SHARE_HEADERS);
  repos().shareViews.insert(s.id, new Date().toISOString(), hashIp(req), (req.headers.get("user-agent") ?? "").slice(0, 200) || null);
  return noContent(SHARE_HEADERS);
}
