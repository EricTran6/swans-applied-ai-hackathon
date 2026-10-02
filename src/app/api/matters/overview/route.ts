// GET /api/matters/overview: landing-page "what needs me today". One Clio call (the open-matter list,
// cached 5 min); everything else is read from our own DB. Never logs record text.
import { getClioAccessToken } from "@/lib/auth";
import { listOpenMatters } from "@/lib/clio";
import { errorJson, json, logError, readViewerId } from "@/lib/server/http";
import type { MatterSummary } from "@/lib/types";
import { buildOverview } from "./build";

export type { AttentionItem, MatterOverview, MattersOverviewResponse, OverviewDigest, OverviewKpi, OverviewShares, ShareActivity, ShareReply } from "./build";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL_MS = 5 * 60 * 1000;
let cache: { at: number; matters: MatterSummary[] } | null = null;

export async function GET(req: Request): Promise<Response> {
  try {
    if (!(await getClioAccessToken().catch(() => null))) return errorJson(401, "Clio not connected");
    if (!cache || Date.now() - cache.at > TTL_MS) cache = { at: Date.now(), matters: await listOpenMatters() };
    return json(buildOverview(cache.matters, readViewerId(req)), 200, { "Cache-Control": "no-store" });
  } catch (err) {
    logError("matters-overview", err);
    return errorJson(502, "could not load overview");
  }
}
