import { getClioAccessToken } from "@/lib/auth";
import { listOpenMatters } from "@/lib/clio";
import { errorJson, json, logError } from "@/lib/server/http";
import type { MatterSummary } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL_MS = 5 * 60 * 1000;
let cache: { at: number; matters: MatterSummary[] } | null = null;


export async function GET(): Promise<Response> {
  try {
    if (!(await getClioAccessToken().catch(() => null))) return errorJson(401, "Clio not connected");
    if (!cache || Date.now() - cache.at > TTL_MS) cache = { at: Date.now(), matters: await listOpenMatters() };
    return json({ matters: cache.matters }, 200, { "Cache-Control": "private, max-age=300" });
  } catch (err) {
    logError("matters", err);
    return errorJson(502, "could not list matters");
  }
}
