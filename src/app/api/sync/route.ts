import { z } from "zod";
import { errorJson, json, parseBody } from "@/lib/server/http";
import { startSync, syncStatus } from "@/lib/server/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ matterId: z.string().min(1).max(64) });

export async function POST(req: Request): Promise<Response> {
  const p = await parseBody(req, Body);
  if ("error" in p) return p.error;
  const { alreadyRunning } = startSync(p.data.matterId);
  return json({ accepted: true, alreadyRunning, status: syncStatus(p.data.matterId) }, 202);
}

export async function GET(req: Request): Promise<Response> {
  const matterId = new URL(req.url).searchParams.get("matterId");
  if (!matterId) return errorJson(400, "matterId required");
  return json(syncStatus(matterId));
}
