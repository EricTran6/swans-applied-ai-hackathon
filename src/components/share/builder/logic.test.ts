import { describe, expect, it } from "vitest";
import type { ShareCandidate } from "@/lib/types";
import {
  builderSections, canSend, counts, groupByCategory, isLocked, lockReason, lockedSummary, openedLabel, sanitize,
  setCategory, sharedIds, toggleCandidate, COVERAGE_LIMITS_ID, NOT_SHARED_REASON,
} from "./logic";

const RID = "prov-jane";
const OTHER = "prov-other";
const mk = (id: string, o: Partial<ShareCandidate> = {}): ShareCandidate => ({
  id, category: "status", label: id, preview: id, included: true, hardDeny: false,
  providerContactId: null, flag: null, ...o,
});
const list = [
  mk("a"), mk("b", { included: false }),
  mk("v", { category: "valuation", hardDeny: true, included: false, flag: { level: "block", reason: "Valuation" } }),
  mk("blk", { category: "updates", flag: { level: "block", reason: "Mentions strategy" }, included: true }),
  mk("rev", { category: "updates", flag: { level: "review", reason: "Check wording" } }),
  mk("o", { category: "other_records", included: false, providerContactId: OTHER }),
];

describe("share builder logic", () => {
  it("counter math: shared + withheld = total, locked never counts as shared", () => {
    const c = counts(list, RID);
    expect(c.shared + c.withheld).toBe(list.length);
    expect(c).toEqual({ shared: 2, withheld: 4 }); // a, rev shared; blk is blocked
  });
  it("hard-deny and blocked items cannot be toggled", () => {
    expect(toggleCandidate(list, "v", RID)).toEqual(list);
    const forced = [mk("h", { hardDeny: true, included: false })];
    expect(toggleCandidate(forced, "h", RID)[0].included).toBe(false);
    expect(isLocked(list[3], RID)).toBe(true);
  });
  it("toggles a normal item and updates counts", () => {
    const next = toggleCandidate(list, "b", RID);
    expect(next.find((c) => c.id === "b")!.included).toBe(true);
    expect(counts(next, RID).shared).toBe(3);
  });
  it("category switch skips locked items", () => {
    const next = setCategory(list, "valuation", true, RID);
    expect(next.find((c) => c.id === "v")!.included).toBe(false);
    expect(counts(setCategory(list, "other_records", true, RID), RID).shared).toBe(3);
  });
  it("sanitize forces locked items off", () => {
    const dirty = [mk("x", { hardDeny: true, included: true })];
    expect(sanitize(dirty, RID)[0].included).toBe(false);
  });
  it("sharedIds excludes locked and adds coverage limits only when toggled", () => {
    expect(sharedIds(list, RID, { coverageLimits: false })).toEqual(["a", "rev"]);
    expect(sharedIds(list, RID, { coverageLimits: true })).toContain(COVERAGE_LIMITS_ID);
  });
  it("groups by category in a stable order", () => {
    expect(groupByCategory(list).map((g) => g.category)).toEqual(["status", "other_records", "updates", "valuation"]);
  });
  it("opened label", () => {
    expect(openedLabel(0, null)).toBe("Not opened yet");
    expect(openedLabel(2, "2026-10-02T10:42:00")).toBe("Opened 2x · last 10:42");
  });
});

describe("fail closed: categories outside the preset", () => {
  const nonPreset = [
    mk("liab", { category: "liability", included: true }),
    mk("exp", { category: "firm_expenses", included: false }),
    mk("pii", { category: "client_pii", included: true }),
  ];
  it("locks them with the reason 'Not shared with providers'", () => {
    for (const c of nonPreset) {
      expect(isLocked(c, RID)).toBe(true);
      expect(lockReason(c, RID)).toBe(NOT_SHARED_REASON);
    }
  });
  it("can never be toggled or category-switched on, and sanitize forces them off", () => {
    let l = sanitize(nonPreset, RID);
    expect(l.every((c) => !c.included)).toBe(true);
    for (const c of nonPreset) l = toggleCandidate(l, c.id, RID);
    l = setCategory(setCategory(setCategory(l, "liability", true, RID), "firm_expenses", true, RID), "client_pii", true, RID);
    expect(l.every((c) => !c.included)).toBe(true);
    expect(sharedIds(nonPreset, RID, { coverageLimits: false })).toEqual([]);
    expect(counts(nonPreset, RID)).toEqual({ shared: 0, withheld: 3 });
  });
});

describe("scope to the recipient", () => {
  const appts = [
    mk("ap1", { category: "appointments", providerContactId: RID }),
    mk("ap2", { category: "appointments", providerContactId: OTHER, included: true }),
    mk("ap3", { category: "appointments", providerContactId: OTHER, included: false }),
  ];
  it("locks other providers' appointments, requests and updates", () => {
    expect(isLocked(appts[1], RID)).toBe(true);
    expect(toggleCandidate(appts, "ap3", RID)[2].included).toBe(false);
    expect(sharedIds(appts, RID, { coverageLimits: false })).toEqual(["ap1"]);
  });
  it("with no recipient contact, provider-scoped items are locked", () => {
    expect(isLocked(appts[0], null)).toBe(true);
  });
  it("other providers' records stay opt-in, not locked", () => {
    expect(isLocked(mk("r", { category: "other_records", providerContactId: OTHER }), RID)).toBe(false);
  });
});

describe("builderSections: collapsed groups", () => {
  const notes = Array.from({ length: 47 }, (_, i) => mk(`note:${i}`, { category: "attorney_notes", hardDeny: true, included: false }));
  const input = [
    mk("status:alive"),
    mk("rq1", { category: "requests", providerContactId: RID }),
    mk("rq2", { category: "requests", providerContactId: OTHER, included: false }),
    mk("rq3", { category: "requests", providerContactId: RID, hardDeny: true, included: false, label: "Completed request" }),
    mk("rq4", { category: "requests", providerContactId: RID, hardDeny: true, included: false }),
    mk("up1", { category: "updates", providerContactId: OTHER, included: false }),
    mk("up2", { category: "updates" }),
    mk("liab", { category: "liability", included: false }),
    mk("bill:x", { category: "other_liens", hardDeny: true, included: false, providerContactId: OTHER }),
    ...notes,
  ];
  const s = builderSections(input, RID);
  const by = (k: string) => s.find((x) => x.category === k)!;

  it("keeps category order and covers every candidate exactly once", () => {
    expect(s.map((x) => x.category)).toEqual(["status", "requests", "updates", "attorney_notes", "liability", "other_liens"]);
    const seen = s.flatMap((x) => [...x.items, ...x.others, ...x.lockedItems]).length
      + s.reduce((n, x) => n + x.hiddenCompleted, 0);
    expect(seen).toBe(input.length);
  });
  it("collapses a fully locked category into one row with the right count", () => {
    const n = by("attorney_notes");
    expect(n.locked).toBe(true);
    expect(n.items).toEqual([]);
    expect(n.lockedItems).toHaveLength(47);
    expect(lockedSummary(n)).toBe("Attorney notes · 47 items · never shared");
  });
  it("non-preset categories collapse with 'Not shared with providers'", () => {
    const l = by("liability");
    expect(l.locked).toBe(true);
    expect(l.reason).toBe(NOT_SHARED_REASON);
    expect(lockedSummary(l)).toBe("Liability · 1 item · not shared with providers");
  });
  it("folds other providers' items and hides completed requests", () => {
    const r = by("requests");
    expect(r.locked).toBe(false);
    expect(r.items.map((x) => x.id)).toEqual(["rq1"]);
    expect(r.others.map((x) => x.id)).toEqual(["rq2"]);
    expect(r.hiddenCompleted).toBe(2);
    expect(by("updates").others.map((x) => x.id)).toEqual(["up1"]);
    expect(by("updates").items.map((x) => x.id)).toEqual(["up2"]);
  });
  it("hidden completed requests count as withheld", () => {
    expect(counts(input, RID)).toEqual({ shared: 3, withheld: input.length - 3 });
  });
});

describe("canSend", () => {
  it("is enabled only with something shared, no link yet and not busy", () => {
    expect(canSend({ shared: 1, link: null, busy: false })).toBe(true);
    expect(canSend({ shared: 0, link: null, busy: false })).toBe(false);
    expect(canSend({ shared: 3, link: "https://x/s/abc", busy: false })).toBe(false);
    expect(canSend({ shared: 3, link: null, busy: true })).toBe(false);
  });
});
