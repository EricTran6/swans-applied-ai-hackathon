import { repos } from "@/lib/db";
import { diffSince } from "@/lib/digest";
import { buildShareSummaries } from "@/lib/server/shares";
import { ensureViewerId, errorJson, json, withViewerCookie } from "@/lib/server/http";
import type { Contact, Matter } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const matterId = url.searchParams.get("matterId");
  if (!matterId) return errorJson(400, "matterId required");
  const r = repos();
  const records = r.items.records(matterId);
  const matter = (records.find((x) => x.sourceType === "matter") as Matter | undefined) ?? null;
  const digest = r.digests.latest(matterId);
  if (!matter && !digest) return errorJson(404, "matter not synced");

  const viewer = ensureViewerId(req);
  const vs = r.viewState.get(viewer.id, matterId);
  const sinceLastOpen = vs ? r.events.listAfter(matterId, vs.lastOpenedAt) : [];

  const body: Record<string, unknown> = {
    matter, digest, contacts: records.filter((x): x is Contact => x.sourceType === "contact"), sinceLastOpen, lastOpenedAt: vs?.lastOpenedAt ?? null,
    shares: buildShareSummaries(matterId), aiCostUsd: r.aiCalls.totalUsd(matterId),
  };
  const since = url.searchParams.get("since");
  if (since) {
    if (Number.isNaN(Date.parse(since))) return errorJson(400, "since must be an ISO date");
    body.diffSince = diffSince(records, since);
    body.sinceLastOpen = body.diffSince; // the brief's "Compare since" reads sinceLastOpen
  }
  return withViewerCookie(json(body), viewer);
}
