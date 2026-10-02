import type { ShareCandidate, ShareCategory } from "@/lib/types";
import { DEFAULT_PRESET } from "@/lib/share/candidates";

/** Synthetic id sent in includedIds when the attorney opts in to showing coverage limits. */
export const COVERAGE_LIMITS_ID = "coverage:limits";
export const NOT_SHARED_REASON = "Not shared with providers";
export const OTHER_PROVIDER_REASON = "About another provider";

/** Recipient provider's Clio contact id (null when the provider has no contact on the matter). */
export type RecipientId = string | null;

export const CATEGORY_LABELS: Record<ShareCategory, string> = {
  status: "Case status", stage: "Case stage", coverage: "Coverage", appointments: "Appointments",
  requests: "What we need from them", own_records: "Their records", own_bill: "Their bill",
  other_records: "Other providers' records", updates: "Updates", care_team: "Care team",
  valuation: "Case valuation", settlement: "Settlement", attorney_notes: "Attorney notes",
  liability: "Liability", firm_expenses: "Firm expenses", other_liens: "Other liens",
  client_pii: "Client personal info", internal_comms: "Internal communications",
};

const ORDER = Object.keys(CATEGORY_LABELS) as ShareCategory[];
/** Only categories in the preset (allow ∪ optIn) can ever be shared; everything else fails closed. */
const SHAREABLE = new Set<ShareCategory>([...DEFAULT_PRESET.allow, ...DEFAULT_PRESET.optIn]);
/** Opt-in categories that may legitimately be about another provider. */
const CROSS_PROVIDER = new Set<ShareCategory>(["other_records", "care_team"]);

export function isShareableCategory(c: ShareCategory): boolean { return SHAREABLE.has(c); }

/** Item is about a provider other than the recipient (and is not an opt-in cross-provider category). */
export function isOtherProvider(c: ShareCandidate, rid: RecipientId): boolean {
  if (c.providerContactId == null || CROSS_PROVIDER.has(c.category)) return false;
  return c.providerContactId !== rid;
}

/** The candidate builder hard-denies a request only once it is complete. */
export function isCompletedRequest(c: ShareCandidate): boolean {
  return c.category === "requests" && c.hardDeny;
}

function lockedByRule(c: ShareCandidate): boolean {
  return c.hardDeny || c.flag?.level === "block" || !SHAREABLE.has(c.category);
}

/** Locked items can never be shared: hard-deny, flagged "block", outside the preset, or another provider's. */
export function isLocked(c: ShareCandidate, rid: RecipientId): boolean {
  return lockedByRule(c) || isOtherProvider(c, rid);
}

export function lockReason(c: ShareCandidate, rid: RecipientId): string | null {
  if (c.hardDeny) return c.flag?.reason || "Never shared with providers";
  if (c.flag?.level === "block") return c.flag.reason;
  if (!SHAREABLE.has(c.category)) return NOT_SHARED_REASON;
  if (isOtherProvider(c, rid)) return OTHER_PROVIDER_REASON;
  return null;
}

/** Fail closed: locked items are forced to excluded, whatever the server said. */
export function sanitize(list: ShareCandidate[], rid: RecipientId): ShareCandidate[] {
  return list.map((c) => (isLocked(c, rid) && c.included ? { ...c, included: false } : c));
}

/** Toggle one item. Locked or unknown ids leave the list unchanged. */
export function toggleCandidate(list: ShareCandidate[], id: string, rid: RecipientId): ShareCandidate[] {
  return list.map((c) => (c.id === id && !isLocked(c, rid) ? { ...c, included: !c.included } : c));
}

/** Include/exclude a whole category; locked items are skipped. */
export function setCategory(list: ShareCandidate[], category: ShareCategory, on: boolean, rid: RecipientId): ShareCandidate[] {
  return list.map((c) => (c.category === category && !isLocked(c, rid) ? { ...c, included: on } : c));
}

export function counts(list: ShareCandidate[], rid: RecipientId): { shared: number; withheld: number } {
  const shared = list.filter((c) => c.included && !isLocked(c, rid)).length;
  return { shared, withheld: list.length - shared };
}

export function sharedIds(list: ShareCandidate[], rid: RecipientId, opts: { coverageLimits: boolean }): string[] {
  const ids = list.filter((c) => c.included && !isLocked(c, rid)).map((c) => c.id);
  if (opts.coverageLimits) ids.push(COVERAGE_LIMITS_ID);
  return ids;
}

export function canSend(s: { shared: number; link: string | null; busy: boolean }): boolean {
  return s.shared > 0 && !s.link && !s.busy;
}

export interface CategoryGroup { category: ShareCategory; label: string; items: ShareCandidate[] }

export function groupByCategory(list: ShareCandidate[]): CategoryGroup[] {
  const by = new Map<ShareCategory, ShareCandidate[]>();
  for (const c of list) by.set(c.category, [...(by.get(c.category) ?? []), c]);
  return ORDER.filter((k) => by.has(k)).map((k) => ({ category: k, label: CATEGORY_LABELS[k], items: by.get(k)! }));
}

export interface BuilderSection {
  category: ShareCategory;
  label: string;
  /** Every item in the category is locked: render one collapsed audit row. */
  locked: boolean;
  /** Collapsed-row reason ("never shared" / "not shared with providers"); null for open sections. */
  reason: string | null;
  /** Rows to render (recipient's own or unscoped items). Empty when locked. */
  items: ShareCandidate[];
  /** Other providers' items, folded into one "Other providers (N), not shared" line. */
  others: ShareCandidate[];
  /** All items of a fully locked category, for the expandable audit list. */
  lockedItems: ShareCandidate[];
  /** Completed requests: hidden, still counted as withheld. */
  hiddenCompleted: number;
}

/** Group candidates into builder sections, collapsing what can never be shared. */
export function builderSections(list: ShareCandidate[], rid: RecipientId): BuilderSection[] {
  return groupByCategory(list).map((g) => {
    const base = { category: g.category, label: g.label, items: [] as ShareCandidate[], others: [] as ShareCandidate[], lockedItems: [] as ShareCandidate[], hiddenCompleted: 0 };
    const neverShared = (c: ShareCandidate) => c.hardDeny || c.flag?.level === "block";
    if (!SHAREABLE.has(g.category)) {
      const reason = g.items.every(neverShared) ? "Never shared" : NOT_SHARED_REASON;
      return { ...base, locked: true, reason, lockedItems: g.items };
    }
    const completed = g.items.filter(isCompletedRequest);
    const rest = g.items.filter((c) => !isCompletedRequest(c));
    if (completed.length === 0 && rest.every(lockedByRule)) {
      return { ...base, locked: true, reason: "Never shared", lockedItems: g.items };
    }
    return {
      ...base, locked: false, reason: null,
      items: rest.filter((c) => !isOtherProvider(c, rid)),
      others: rest.filter((c) => isOtherProvider(c, rid)),
      hiddenCompleted: completed.length,
    };
  });
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "Attorney notes · 47 items · never shared". */
export function lockedSummary(s: Pick<BuilderSection, "label" | "lockedItems" | "reason">): string {
  return `${s.label} · ${plural(s.lockedItems.length, "item")} · ${(s.reason ?? "never shared").toLowerCase()}`;
}

/** "Other providers (3), not shared". */
export function othersSummary(n: number): string {
  return `Other providers (${n}), not shared`;
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
