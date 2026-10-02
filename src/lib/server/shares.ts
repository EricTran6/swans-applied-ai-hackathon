import { repos } from "@/lib/db";
import type { ShareSummary } from "@/lib/types";

export function buildShareSummaries(matterId: string): ShareSummary[] {
  const r = repos();
  return r.shares.listByMatter(matterId).map((s) => ({
    shareId: s.id, recipientLabel: s.recipientLabel, recipientContactId: s.recipientContactId,
    createdAt: s.createdAt, expiresAt: s.expiresAt, revokedAt: s.revokedAt,
    ...r.shareViews.stats(s.id), sharedCount: s.sharedCount, withheldCount: s.withheldCount,
    responses: r.shareResponses.listByShare(s.id),
  }));
}

/** Resolve a raw token to a live share, or null. Unknown, expired and revoked are indistinguishable. */
export function findLiveShare(hashToken: (t: string) => string, token: string) {
  if (!token || token.length > 200) return null;
  const s = repos().shares.getByTokenHash(hashToken(token));
  if (!s || s.revokedAt || Date.parse(s.expiresAt) <= Date.now()) return null;
  return s;
}
