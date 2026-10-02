import { z } from "zod";
import { repos } from "@/lib/db";
import { errorJson, noContent, parseAttorneyBody } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ shareId: z.string().min(1).max(64) });

export async function POST(req: Request): Promise<Response> {
  const p = await parseAttorneyBody(req, Body);
  if ("error" in p) return p.error;
  const r = repos();
  if (!r.shares.get(p.data.shareId)) return errorJson(404, "not found");
  r.shares.revoke(p.data.shareId, new Date().toISOString());
  return noContent();
}
