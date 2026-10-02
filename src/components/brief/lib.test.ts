import { describe, expect, it } from "vitest";
import type { Injury, SourceRef, TimelineEvent, WaterfallStep } from "@/lib/types";
import {
  ageFromDob, billBars, daysBetween, formatDate, formatUsd, formatUsdCompact, groupInjuries, initialsOf,
  niceCeil, rangeBarLayout, relativeTime, sortFilterTimeline, stripLayout, uniqueRefs, waterfallLayout,
} from "./lib";

const ref = (drawerKey: string, value = "v"): SourceRef => ({
  value, sourceType: "note", clioId: drawerKey.split(":")[1] ?? "1", sourceDate: null, quote: null,
  drawerKey, derivation: "clio-metadata", quoteVerified: false,
});
const ev = (id: string, date: string, title = id, category: TimelineEvent["category"] = "legal"): TimelineEvent => ({
  id, date, title, category, derivation: "stated", milestone: true, refs: [ref(`note:${id}`)],
});

describe("formatting", () => {
  it("formats usd", () => {
    expect(formatUsd(239865)).toBe("$239,865");
    expect(formatUsd(-9400)).toBe("-$9,400");
    expect(formatUsd(null)).toBe("—");
    expect(formatUsdCompact(250000)).toBe("$250k");
    expect(formatUsdCompact(1_200_000)).toBe("$1.2M");
    expect(formatUsdCompact(1500)).toBe("$1.5k");
    expect(formatUsdCompact(735)).toBe("$735");
  });
  it("formats dates in UTC without shifting", () => {
    expect(formatDate("2024-03-10")).toBe("Mar 10, 2024");
    expect(formatDate("2024-03-10", { year: false })).toBe("Mar 10");
    expect(formatDate(null)).toBe("—");
  });
  it("computes days and relative time", () => {
    expect(daysBetween("2026-09-28", "2026-10-02")).toBe(4);
    const now = Date.parse("2026-10-02T12:00:00Z");
    expect(relativeTime("2026-10-02T11:59:50Z", now)).toBe("just now");
    expect(relativeTime("2026-10-02T11:30:00Z", now)).toBe("30 min ago");
    expect(relativeTime("2026-10-02T09:00:00Z", now)).toBe("3 h ago");
    expect(relativeTime("2026-09-30T12:00:00Z", now)).toBe("2 days ago");
    expect(relativeTime(null, now)).toBe("never");
  });
  it("computes age and initials", () => {
    expect(ageFromDob("1990-10-03", Date.parse("2026-10-02T00:00:00Z"))).toBe(35);
    expect(ageFromDob("1990-10-02", Date.parse("2026-10-02T00:00:00Z"))).toBe(36);
    expect(ageFromDob(null)).toBeNull();
    expect(initialsOf("Jane Doe")).toBe("JD");
    expect(initialsOf("Doe, Jane Q")).toBe("DJ");
  });
  it("dedupes refs by drawerKey", () => {
    expect(uniqueRefs([ref("note:1"), ref("note:2"), ref("note:1")]).map((r) => r.drawerKey)).toEqual(["note:1", "note:2"]);
  });
});

describe("rangeBarLayout", () => {
  it("shades the gap between cap and value", () => {
    const l = rangeBarLayout({ low: 250000, high: 600000, cap: 250000 })!;
    expect(l.max).toBeGreaterThanOrEqual(600000);
    expect(l.capPct!).toBeCloseTo((250000 / l.max) * 100);
    expect(l.highPct).toBeCloseTo((600000 / l.max) * 100);
    expect(l.gap).toEqual({ fromPct: l.capPct, toPct: l.highPct, amount: 350000 });
    expect(l.ticks[0]).toEqual({ pct: 0, label: "$0" });
    expect(l.ticks).toHaveLength(5);
  });
  it("has no gap when value is under the cap", () => {
    const l = rangeBarLayout({ low: 50000, high: 80000, cap: 100000 })!;
    expect(l.gap).toBeNull();
    expect(l.capPct!).toBeGreaterThan(l.highPct);
  });
  it("handles a missing cap or value", () => {
    expect(rangeBarLayout({ low: null, high: 120000, cap: null })!.capPct).toBeNull();
    expect(rangeBarLayout({ low: null, high: null, cap: 100000 })!.gap).toBeNull();
    expect(rangeBarLayout({ low: null, high: null, cap: null })).toBeNull();
    expect(rangeBarLayout({ low: 0, high: 0, cap: 0 })).toBeNull();
  });
  it("never exceeds 100%", () => {
    const l = rangeBarLayout({ low: 10, high: 1_000_000, cap: 5 })!;
    expect(l.highPct).toBeLessThanOrEqual(100);
    expect(l.lowPct).toBeGreaterThanOrEqual(0);
  });
  it("niceCeil rounds to readable maxima", () => {
    expect(niceCeil(648000)).toBe(1_000_000);
    expect(niceCeil(270000)).toBe(500000);
    expect(niceCeil(190000)).toBe(200000);
    expect(niceCeil(0)).toBe(1);
  });
});

describe("waterfallLayout", () => {
  const steps: WaterfallStep[] = [
    { label: "Cap", amount: 1000, kind: "start", refs: [] },
    { label: "Lien", amount: -200, kind: "minus", refs: [] },
    { label: "Costs", amount: -100, kind: "minus", refs: [] },
    { label: "Net", amount: 700, kind: "result", refs: [] },
  ];
  it("floats minus steps from the running total", () => {
    const bars = waterfallLayout(steps);
    expect(bars.map((b) => [b.fromPct, b.toPct])).toEqual([[0, 100], [80, 100], [70, 80], [0, 70]]);
    expect(bars.map((b) => b.running)).toEqual([1000, 800, 700, 700]);
  });
  it("treats positive minus amounts as deductions and handles empty", () => {
    const bars = waterfallLayout([{ ...steps[0]! }, { ...steps[1]!, amount: 200 }]);
    expect(bars[1]!.running).toBe(800);
    expect(waterfallLayout([])).toEqual([]);
  });
});

describe("stripLayout", () => {
  it("positions events by time within the padded width", () => {
    const l = stripLayout([ev("b", "2025-01-01"), ev("a", "2024-01-01"), ev("c", "2026-01-01")], { width: 1000, pad: 50, minGap: 10 });
    expect(l.points.map((p) => p.event.id)).toEqual(["a", "b", "c"]);
    expect(l.points[0]!.x).toBe(50);
    expect(l.points[2]!.x).toBe(950);
    expect(l.points[1]!.x).toBeCloseTo(50 + 900 * (366 / 731), 0);
    expect(l.ticks.map((t) => t.label)).toEqual(["2025", "2026"]);
    expect(l.points.every((p) => p.lane === 0)).toBe(true);
  });
  it("moves colliding labels to other lanes", () => {
    const l = stripLayout([ev("a", "2024-01-01"), ev("b", "2024-01-05"), ev("c", "2024-01-09"), ev("d", "2026-01-01")], { width: 1000, minGap: 120, maxLanes: 3 });
    expect(l.points.map((p) => p.lane)).toEqual([0, 1, 2, 0]);
    expect(l.lanes).toBe(3);
  });
  it("reuses the oldest lane when lanes are exhausted", () => {
    const l = stripLayout([ev("a", "2024-01-01"), ev("b", "2024-01-02"), ev("c", "2024-01-03")], { width: 1000, minGap: 500, maxLanes: 2 });
    expect(l.points.map((p) => p.lane)).toEqual([0, 1, 0]);
  });
  it("extends to today when recent and marks it", () => {
    const now = Date.parse("2026-10-02T00:00:00Z");
    const l = stripLayout([ev("a", "2024-01-01"), ev("b", "2026-01-01")], { width: 1000, pad: 0, now });
    expect(l.today).toBe(1000);
    expect(l.points[1]!.x).toBeLessThan(1000);
  });
  it("handles empty and single events", () => {
    expect(stripLayout([], { width: 500 }).points).toEqual([]);
    const one = stripLayout([ev("a", "2024-01-01")], { width: 500, pad: 20 });
    expect(one.points[0]!.x).toBe(20);
  });
});

describe("groupInjuries", () => {
  const inj = (name: string, bodyPart: string | null, status: Injury["status"]): Injury =>
    ({ name, bodyPart, status, firstDocumented: null, refs: [] });
  it("groups by body part in first-seen order, surgery first", () => {
    const g = groupInjuries([
      inj("sprain", "Neck", "diagnosed"), inj("tear", "Left shoulder", "diagnosed"),
      inj("fusion", "Neck", "surgery-done"), inj("x", null, "diagnosed"),
    ]);
    expect(g.map((x) => x.bodyPart)).toEqual(["Neck", "Left shoulder", "Other"]);
    expect(g[0]!.injuries.map((i) => i.name)).toEqual(["fusion", "sprain"]);
  });
});

describe("sortFilterTimeline", () => {
  const events = [ev("a", "2024-05-01", "Zeta", "treatment"), ev("b", "2024-01-01", "Alpha", "legal"), ev("c", "2025-01-01", "Mid", "treatment")];
  it("sorts by date and title in both directions", () => {
    expect(sortFilterTimeline(events, { sort: "date", dir: "asc" }).map((e) => e.id)).toEqual(["b", "a", "c"]);
    expect(sortFilterTimeline(events, { sort: "date", dir: "desc" }).map((e) => e.id)).toEqual(["c", "a", "b"]);
    expect(sortFilterTimeline(events, { sort: "title", dir: "asc" }).map((e) => e.id)).toEqual(["b", "c", "a"]);
  });
  it("filters by category and query", () => {
    expect(sortFilterTimeline(events, { sort: "date", dir: "asc", category: "treatment" }).map((e) => e.id)).toEqual(["a", "c"]);
    expect(sortFilterTimeline(events, { sort: "date", dir: "asc", query: "alp" }).map((e) => e.id)).toEqual(["b"]);
  });
});

describe("billBars", () => {
  it("sorts descending and scales to the max", () => {
    const bars = billBars([{ amount: 50 }, { amount: 200 }, { amount: 100 }]);
    expect(bars.map((b) => b.pct)).toEqual([100, 50, 25]);
  });
});
