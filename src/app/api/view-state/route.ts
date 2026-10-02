import { z } from "zod";
import { repos } from "@/lib/db";
import { ensureViewerId, noContent, parseAttorneyBody, withViewerCookie } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ matterId: z.string().min(1).max(64) });

export async function POST(req: Request): Promise<Response> {
  const p = await parseAttorneyBody(req, Body);
  if ("error" in p) return p.error;
  const viewer = ensureViewerId(req);
  const r = repos();
  r.viewState.upsert(viewer.id, p.data.matterId, new Date().toISOString(), r.digests.latest(p.data.matterId)?.version ?? null);
  return withViewerCookie(noContent(), viewer);
}
