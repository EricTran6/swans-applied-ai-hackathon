import type { ShareCandidate, ShareCategory } from "@/lib/types";

/** Synthetic id sent in includedIds when the attorney opts in to showing coverage limits. */
export const COVERAGE_LIMITS_ID = "coverage:limits";

export const CATEGORY_LABELS: Record<ShareCategory, string> = {
  status: "Case status", stage: "Case stage", coverage: "Coverage", appointments: "Appointments",
  requests: "What we need from them", own_records: "Their records", own_bill: "Their bill",
  other_records: "Other providers' records", updates: "Updates", care_team: "Care team",
  valuation: "Case valuation", settlement: "Settlement", attorney_notes: "Attorney notes",
  liability: "Liability", firm_expenses: "Firm expenses", other_liens: "Other liens",
  client_pii: "Client personal info", internal_comms: "Internal communications",
};

const ORDER = Object.keys(CATEGORY_LABELS) as ShareCategory[];

/** Locked items can never be shared: hard-deny categories and anything flagged "block". */
export function isLocked(c: ShareCandidate): boolean {
  return c.hardDeny || c.flag?.level === "block";
}

export function lockReason(c: ShareCandidate): string | null {
  if (c.hardDeny) return c.flag?.reason || "Never shared with providers";
  if (c.flag?.level === "block") return c.flag.reason;
  return null;
}

/** Fail closed: locked items are forced to excluded, whatever the server said. */
export function sanitize(list: ShareCandidate[]): ShareCandidate[] {
  return list.map((c) => (isLocked(c) && c.included ? { ...c, included: false } : c));
}

/** Toggle one item. Locked or unknown ids leave the list unchanged. */
export function toggleCandidate(list: ShareCandidate[], id: string): ShareCandidate[] {
  return list.map((c) => (c.id === id && !isLocked(c) ? { ...c, included: !c.included } : c));
}

/** Include/exclude a whole category; locked items are skipped. */
export function setCategory(list: ShareCandidate[], category: ShareCategory, on: boolean): ShareCandidate[] {
  return list.map((c) => (c.category === category && !isLocked(c) ? { ...c, included: on } : c));
}

export function counts(list: ShareCandidate[]): { shared: number; withheld: number } {
  const shared = list.filter((c) => c.included && !isLocked(c)).length;
  return { shared, withheld: list.length - shared };
}

export function sharedIds(list: ShareCandidate[], opts: { coverageLimits: boolean }): string[] {
  const ids = list.filter((c) => c.included && !isLocked(c)).map((c) => c.id);
  if (opts.coverageLimits) ids.push(COVERAGE_LIMITS_ID);
  return ids;
}

export interface CategoryGroup { category: ShareCategory; label: string; items: ShareCandidate[] }

export function groupByCategory(list: ShareCandidate[]): CategoryGroup[] {
  const by = new Map<ShareCategory, ShareCandidate[]>();
  for (const c of list) by.set(c.category, [...(by.get(c.category) ?? []), c]);
  return ORDER.filter((k) => by.has(k)).map((k) => ({ category: k, label: CATEGORY_LABELS[k], items: by.get(k)! }));
}

/** Preview sections: only what is actually shared, grouped by category. */
export function previewSections(list: ShareCandidate[]): CategoryGroup[] {
  return groupByCategory(list.filter((c) => c.included && !isLocked(c)));
}

/** "Opened 2x · last 10:42" or "Not opened yet". */
export function openedLabel(views: number, lastViewedAt: string | null): string {
  if (views <= 0) return "Not opened yet";
  const t = lastViewedAt ? new Date(lastViewedAt) : null;
  const time = t && !isNaN(t.getTime())
    ? t.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
    : null;
  return `Opened ${views}x${time ? ` · last ${time}` : ""}`;
}
