import { z } from "zod";
import { errorJson, json, logError, parseBody } from "@/lib/server/http";
import { buildAndStoreDigest, NotSyncedError } from "@/lib/server/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Body = z.object({ matterId: z.string().min(1).max(64), force: z.boolean().optional() });

export async function POST(req: Request): Promise<Response> {
  const p = await parseBody(req, Body);
  if ("error" in p) return p.error;
  try {
    const { version, changed, costUsd, durationMs } = await buildAndStoreDigest(p.data.matterId, { force: p.data.force });
    return json({ version, changed, costUsd, durationMs });
  } catch (err) {
    if (err instanceof NotSyncedError) return errorJson(409, "matter not synced");
    logError("digest.refresh", err);
    return errorJson(500, "digest failed");
  }
}
