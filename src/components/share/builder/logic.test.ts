import { describe, expect, it } from "vitest";
import type { ShareCandidate } from "@/lib/types";
import { counts, groupByCategory, isLocked, openedLabel, sanitize, setCategory, sharedIds, toggleCandidate, COVERAGE_LIMITS_ID } from "./logic";

const mk = (id: string, o: Partial<ShareCandidate> = {}): ShareCandidate => ({
  id, category: "status", label: id, preview: id, included: true, hardDeny: false,
  providerContactId: null, flag: null, ...o,
});
const list = [
  mk("a"), mk("b", { included: false }),
  mk("v", { category: "valuation", hardDeny: true, included: false, flag: { level: "block", reason: "Valuation" } }),
  mk("blk", { category: "updates", flag: { level: "block", reason: "Mentions strategy" }, included: true }),
  mk("rev", { category: "updates", flag: { level: "review", reason: "Check wording" } }),
  mk("o", { category: "other_records", included: false }),
];

describe("share builder logic", () => {
  it("counter math: shared + withheld = total, locked never counts as shared", () => {
    const c = counts(list);
    expect(c.shared + c.withheld).toBe(list.length);
    expect(c).toEqual({ shared: 2, withheld: 4 }); // a, rev shared; blk is blocked
  });
  it("hard-deny and blocked items cannot be toggled", () => {
    expect(toggleCandidate(list, "v")).toEqual(list);
    const forced = [mk("h", { hardDeny: true, included: false })];
    expect(toggleCandidate(forced, "h")[0].included).toBe(false);
    expect(isLocked(list[3])).toBe(true);
  });
  it("toggles a normal item and updates counts", () => {
    const next = toggleCandidate(list, "b");
    expect(next.find((c) => c.id === "b")!.included).toBe(true);
    expect(counts(next).shared).toBe(3);
  });
  it("category switch skips locked items", () => {
    const next = setCategory(list, "valuation", true);
    expect(next.find((c) => c.id === "v")!.included).toBe(false);
    expect(counts(setCategory(list, "other_records", true)).shared).toBe(3);
  });
  it("sanitize forces locked items off", () => {
    const dirty = [mk("x", { hardDeny: true, included: true })];
    expect(sanitize(dirty)[0].included).toBe(false);
  });
  it("sharedIds excludes locked and adds coverage limits only when toggled", () => {
    expect(sharedIds(list, { coverageLimits: false })).toEqual(["a", "rev"]);
    expect(sharedIds(list, { coverageLimits: true })).toContain(COVERAGE_LIMITS_ID);
  });
  it("groups by category in a stable order", () => {
    expect(groupByCategory(list).map((g) => g.category)).toEqual(["status", "other_records", "updates", "valuation"]);
  });
  it("opened label", () => {
    expect(openedLabel(0, null)).toBe("Not opened yet");
    expect(openedLabel(2, "2026-10-02T10:42:00")).toBe("Opened 2x · last 10:42");
  });
});
