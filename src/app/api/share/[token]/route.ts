import { errorJson, json, SHARE_HEADERS } from "@/lib/server/http";
import { findLiveShare } from "@/lib/server/shares";
import { hashToken } from "@/lib/share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await ctx.params;
  const s = findLiveShare(hashToken, token);
  if (!s) return errorJson(404, "not found", SHARE_HEADERS);
  return json(JSON.parse(s.payloadJson), 200, SHARE_HEADERS);
}
