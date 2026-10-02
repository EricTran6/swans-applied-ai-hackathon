import { describe, expect, it } from "vitest";
import type { Injury, SourceRef, TimelineEvent, WaterfallStep } from "@/lib/types";
import {
  ageFromDob, billBars, daysBetween, formatDate, formatUsd, formatUsdCompact, groupInjuries, initialsOf,
  clusterDots, compressedScale, niceCeil, rangeBarLayout, recoveryInputs, relativeTime, sortFilterTimeline, stripLayout, uniqueRefs,
  waterfallLayout,
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

const DAY = 86_400_000;
const dense = () => {
  // 12 milestones: 2 old ones, then 10 packed into ~a year (several within days of each other)
  const dates = ["2022-03-01", "2023-01-10", "2025-07-12", "2025-08-01", "2025-08-03", "2025-08-20", "2025-09-02",
    "2025-10-11", "2025-11-30", "2026-01-15", "2026-02-02", "2026-03-09"];
  return dates.map((d, i) => ev(`e${i}`, d, `Milestone number ${i} with a long title`));
};

describe("compressedScale", () => {
  const t0 = Date.parse("2020-01-01T00:00:00Z");
  const anchors = [t0, t0 + 10 * DAY, t0 + 20 * DAY, t0 + 1500 * DAY, t0 + 1510 * DAY, t0 + 3000 * DAY, t0 + 3005 * DAY];
  it("is monotonic and fills the inner width", () => {
    const sc = compressedScale(anchors, { width: 1000, pad: 50 });
    const xs = anchors.map(sc.xOf);
    for (let i = 1; i < xs.length; i++) expect(xs[i]!).toBeGreaterThanOrEqual(xs[i - 1]!);
    expect(xs[0]).toBe(50);
    expect(xs[xs.length - 1]).toBeCloseTo(950, 5);
    const mids = Array.from({ length: 200 }, (_, i) => sc.xOf(t0 + (i * 3005 * DAY) / 199));
    for (let i = 1; i < mids.length; i++) expect(mids[i]!).toBeGreaterThanOrEqual(mids[i - 1]!);
  });
  it("caps every empty stretch over 120 days at 8% of the width and reports breaks", () => {
    const sc = compressedScale(anchors, { width: 1000, pad: 50 });
    const inner = 900;
    expect(sc.breaks).toHaveLength(2);
    for (const b of sc.breaks) expect(b.width).toBeLessThanOrEqual(inner * 0.08 + 1e-6);
    expect(sc.xOf(t0 + 1500 * DAY) - sc.xOf(t0 + 20 * DAY)).toBeLessThanOrEqual(inner * 0.08 + 1e-6);
  });
  it("does not compress gaps of 120 days or less", () => {
    const sc = compressedScale([t0, t0 + 100 * DAY, t0 + 200 * DAY], { width: 1000, pad: 0 });
    expect(sc.breaks).toEqual([]);
    expect(sc.xOf(t0 + 100 * DAY)).toBeCloseTo(500, 5);
  });
  it("handles degenerate inputs", () => {
    expect(compressedScale([], { width: 500, pad: 20 }).xOf(5)).toBe(20);
    expect(compressedScale([t0], { width: 500, pad: 20 }).xOf(t0)).toBe(20);
  });
});

describe("clusterDots", () => {
  it("merges dots closer than 8px and keeps others apart", () => {
    const pts = [0, 3, 6, 40, 47, 100].map((x, i) => ({ event: ev(`p${i}`, "2024-01-01"), x }));
    const cl = clusterDots(pts, 8);
    expect(cl.map((c) => c.events.length)).toEqual([3, 2, 1]);
    expect(cl[0]!.x).toBeCloseTo(3);
  });
});

describe("stripLayout", () => {
  const boxesOf = (l: ReturnType<typeof stripLayout>) => {
    const out: { l: number; r: number; side: string; row: number }[] = [];
    for (const c of l.clusters) if (c.label) out.push({ l: c.label.left, r: c.label.right, side: c.label.side, row: c.label.row });
    if (l.today?.box) out.push({ l: l.today.box.left, r: l.today.box.right, side: l.today.box.side, row: l.today.box.row });
    return out;
  };
  for (const width of [1280, 1920, 2560]) {
    it(`never overlaps label boxes for 12 dense milestones at ${width}px`, () => {
      const now = Date.parse("2026-04-01T00:00:00Z");
      const l = stripLayout(dense(), { width, now });
      const b = boxesOf(l);
      expect(b.length).toBeGreaterThan(0);
      for (let i = 0; i < b.length; i++) {
        for (let j = i + 1; j < b.length; j++) {
          if (b[i]!.side === b[j]!.side && b[i]!.row === b[j]!.row) {
            expect(b[i]!.r <= b[j]!.l || b[j]!.r <= b[i]!.l).toBe(true);
          }
        }
        expect(b[i]!.l).toBeGreaterThanOrEqual(0);
        expect(b[i]!.r).toBeLessThanOrEqual(width);
      }
      expect(l.clusters.every((c) => c.events.length >= 1)).toBe(true);
      expect(l.clusters.reduce((n, c) => n + c.events.length, 0)).toBe(12);
      expect(l.today?.box).not.toBeNull();
    });
  }
  it("gives more labels more room on wider strips", () => {
    const n = (w: number) => stripLayout(dense(), { width: w }).clusters.filter((c) => c.label).length;
    expect(n(2560)).toBeGreaterThanOrEqual(n(1280));
  });
  it("drops text (label null) rather than overlap when slots run out", () => {
    const evs = ["a", "b", "c", "d", "e", "f", "g", "h"].map((id, i) => ev(id, `2024-01-${10 + i * 2}`, "Same long title here"));
    const l = stripLayout(evs, { width: 400, pad: 20, clusterPx: 1 });
    expect(l.clusters.some((c) => c.label === null)).toBe(true);
    const b = boxesOf(l);
    for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++)
      if (b[i]!.side === b[j]!.side && b[i]!.row === b[j]!.row) expect(b[i]!.r <= b[j]!.l || b[j]!.r <= b[i]!.l).toBe(true);
  });
  it("clusters dots under 8px with a count", () => {
    const l = stripLayout([ev("a", "2024-01-01"), ev("b", "2024-01-02"), ev("c", "2024-04-28")], { width: 800, pad: 20 });
    expect(l.clusters.map((c) => c.events.length)).toEqual([2, 1]);
    expect(l.clusters[0]!.label?.text).toBe("2 events");
  });
  it("positions the first and last events at the padding and marks today when recent", () => {
    const now = Date.parse("2026-10-02T00:00:00Z");
    const l = stripLayout([ev("a", "2026-06-01"), ev("b", "2026-08-01")], { width: 1000, pad: 50, now });
    expect(l.clusters[0]!.x).toBe(50);
    expect(l.today!.x).toBe(950);
    expect(l.clusters[1]!.x).toBeLessThan(950);
  });
  describe("today marker", () => {
    const now = Date.parse("2026-10-02T00:00:00Z");
    it("shows today between past and future milestones", () => {
      const l = stripLayout([ev("a", "2025-01-01"), ev("b", "2026-09-01"), ev("c", "2026-11-15")], { width: 1000, pad: 50, now });
      expect(l.today).not.toBeNull();
      const past = l.clusters.find((c) => c.events[0]!.id === "b")!;
      const future = l.clusters.find((c) => c.events[0]!.id === "c")!;
      expect(l.today!.x).toBeGreaterThan(past.x);
      expect(l.today!.x).toBeLessThan(future.x);
    });
    it("shows today at the right end when after all milestones", () => {
      const l = stripLayout([ev("a", "2026-06-01"), ev("b", "2026-08-01")], { width: 1000, pad: 50, now });
      expect(l.today!.x).toBe(950);
    });
    it("hides today when before the first milestone or no now given", () => {
      const evs = [ev("a", "2026-11-01"), ev("b", "2026-12-01")];
      expect(stripLayout(evs, { width: 1000, pad: 50, now }).today).toBeNull();
      expect(stripLayout(evs, { width: 1000, pad: 50 }).today).toBeNull();
    });
    it("never lets a cluster label cover the today label", () => {
      const l = stripLayout([ev("a", "2026-09-28"), ev("b", "2026-09-30"), ev("c", "2026-10-04"), ev("d", "2026-10-06"), ev("e", "2025-01-01")], { width: 600, pad: 40, now });
      const t = l.today!.box!;
      expect(t).not.toBeNull();
      for (const c of l.clusters) {
        if (c.label && c.label.side === t.side && c.label.row === t.row) {
          expect(c.label.right <= t.left || t.right <= c.label.left).toBe(true);
        }
      }
    });
  });
  it("handles empty and single events", () => {
    expect(stripLayout([], { width: 500 }).clusters).toEqual([]);
    const one = stripLayout([ev("a", "2024-01-01")], { width: 500, pad: 20 });
    expect(one.clusters[0]!.x).toBe(20);
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

describe("recoveryInputs", () => {
  const exp = (id: string): SourceRef => ({ ...ref(`expense:${id}`), sourceType: "expense" });
  const steps: WaterfallStep[] = [
    { label: "Coverage cap", amount: 50_000, kind: "start", refs: [ref("custom_field:1")] },
    { label: "State lien", amount: -4_000, kind: "minus", refs: [ref("note:2")] },
    { label: "Firm costs", amount: -500, kind: "minus", refs: [exp("3"), exp("4")] },
    { label: "Before attorney fees", amount: 45_500, kind: "result", refs: [] },
  ];
  const bills = [{ providerContactId: "9", providerName: "Clinic", amount: 7_000, servicesThrough: null, refs: [exp("5")] }];

  it("splits liens from firm costs by source, not by label", () => {
    const r = recoveryInputs({ valueWaterfall: steps, providerBills: bills })!;
    expect(r.cap).toBe(50_000);
    expect(r.liens).toEqual([{ label: "State lien", amount: 4_000, refs: [ref("note:2")] }]);
    expect(r.costs?.amount).toBe(500);
    expect(r.providers).toEqual([{ label: "Clinic", amount: 7_000, refs: [exp("5")] }]);
  });

  it("returns null without a coverage cap", () => {
    expect(recoveryInputs({ valueWaterfall: [], providerBills: bills })).toBeNull();
  });
});
