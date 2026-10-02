import { z } from "zod";
import { repos } from "@/lib/db";
import { errorJson, json, parseBody } from "@/lib/server/http";
import { buildCandidates, DEFAULT_PRESET } from "@/lib/share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Cat = z.string().min(1).max(40);
const Body = z.object({
  matterId: z.string().min(1).max(64), recipientLabel: z.string().min(1).max(200),
  recipientContactId: z.string().max(64).nullish(),
  preset: z.object({ allow: z.array(Cat), optIn: z.array(Cat) }).optional(),
});

export async function POST(req: Request): Promise<Response> {
  const p = await parseBody(req, Body);
  if ("error" in p) return p.error;
  const r = repos();
  const digest = r.digests.latest(p.data.matterId);
  if (!digest) return errorJson(409, "no digest for matter");
  const candidates = buildCandidates(digest, r.items.records(p.data.matterId), p.data.recipientContactId ?? null,
    (p.data.preset as typeof DEFAULT_PRESET | undefined) ?? DEFAULT_PRESET);
  const shared = candidates.filter((c) => c.included).length;
  return json({ candidates, counts: { shared, withheld: candidates.length - shared } });
}
