// Pure helpers for the attorney brief UI. No React, no case data: unit-tested in lib.test.ts.
import type { Injury, SourceRef, TimelineEvent, WaterfallStep } from "@/lib/types";

const DAY_MS = 86_400_000;

// ---------- formatting ----------
export function formatUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.round(Math.abs(n)).toLocaleString("en-US")}`;
}

/** $250k, $1.2M, $735. */
export function formatUsdCompact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${sign}$${trimZero((a / 1_000_000).toFixed(1))}M`;
  if (a >= 10_000) return `${sign}$${Math.round(a / 1000)}k`;
  if (a >= 1_000) return `${sign}$${trimZero((a / 1000).toFixed(1))}k`;
  return `${sign}$${Math.round(a)}`;
}
function trimZero(s: string): string {
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

/** Parse "YYYY-MM-DD" or ISO into epoch ms; date-only strings are treated as UTC midnight. */
export function toMs(date: string): number {
  return Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00Z` : date);
}

/** "Oct 9, 2026" (UTC, so date-only strings never shift a day). */
export function formatDate(date: string | null | undefined, opts: { year?: boolean } = {}): string {
  if (!date) return "—";
  const ms = toMs(date);
  if (Number.isNaN(ms)) return date;
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short", day: "numeric", ...(opts.year === false ? {} : { year: "numeric" }), timeZone: "UTC",
  });
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string | number, to: string | number): number {
  const a = typeof from === "number" ? from : toMs(from);
  const b = typeof to === "number" ? to : toMs(to);
  return Math.floor((b - a) / DAY_MS);
}

/** "just now", "5 min ago", "3 h ago", "2 days ago". */
export function relativeTime(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "never";
  const ms = toMs(iso);
  if (Number.isNaN(ms)) return "unknown";
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "1 day ago" : `${d} days ago`;
}

export function ageFromDob(dob: string | null, now: number = Date.now()): number | null {
  if (!dob) return null;
  const b = new Date(toMs(dob));
  const n = new Date(now);
  let age = n.getUTCFullYear() - b.getUTCFullYear();
  if (n.getUTCMonth() < b.getUTCMonth() || (n.getUTCMonth() === b.getUTCMonth() && n.getUTCDate() < b.getUTCDate())) age--;
  return Number.isFinite(age) ? age : null;
}

export function initialsOf(name: string): string {
  return name.split(/[\s,]+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

/** Dedupe refs by drawerKey, keeping first occurrence. */
export function uniqueRefs(refs: SourceRef[]): SourceRef[] {
  const seen = new Set<string>();
  return refs.filter((r) => (seen.has(r.drawerKey) ? false : (seen.add(r.drawerKey), true)));
}

// ---------- value vs coverage range bar ----------
export interface RangeBarLayout {
  max: number;              // domain max (value axis 0..max)
  lowPct: number;           // left edge of the estimate band
  highPct: number;          // right edge of the estimate band (the value)
  capPct: number | null;    // coverage cap marker
  gap: { fromPct: number; toPct: number; amount: number } | null; // value above the cap (uncollectable)
  ticks: { pct: number; label: string }[];
}

/**
 * Lays out 0 -> value with a cap marker. The gap is the part of the value that coverage does not reach.
 * All positions are percentages of the bar width.
 */
export function rangeBarLayout(input: { low: number | null; high: number | null; cap: number | null }): RangeBarLayout | null {
  const high = finite(input.high);
  const cap = finite(input.cap);
  if (high == null && cap == null) return null;
  const low = Math.min(finite(input.low) ?? high ?? 0, high ?? Infinity);
  const top = Math.max(high ?? 0, cap ?? 0);
  if (top <= 0) return null;
  const max = niceCeil(top * 1.08);
  const pct = (v: number) => clamp((v / max) * 100, 0, 100);
  const gap = high != null && cap != null && high > cap
    ? { fromPct: pct(cap), toPct: pct(high), amount: high - cap }
    : null;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ pct: f * 100, label: formatUsdCompact(max * f) }));
  return {
    max,
    lowPct: pct(Math.max(0, low)),
    highPct: pct(high ?? cap ?? 0),
    capPct: cap != null ? pct(cap) : null,
    gap,
    ticks,
  };
}

function finite(n: number | null | undefined): number | null {
  return n != null && Number.isFinite(n) ? n : null;
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
/** Round up to 1, 2, 2.5 or 5 x 10^k so axis ticks are readable. */
export function niceCeil(n: number): number {
  if (n <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(n));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= n) return m * p;
  return 10 * p;
}

// ---------- waterfall ----------
export interface WaterfallBar { step: WaterfallStep; fromPct: number; toPct: number; running: number }

/** Horizontal waterfall: start bar from 0, minus bars float down from the running total, result bar from 0. */
export function waterfallLayout(steps: WaterfallStep[]): WaterfallBar[] {
  if (!steps.length) return [];
  let running = 0;
  const raw = steps.map((step) => {
    if (step.kind === "start") {
      running = step.amount;
      return { step, from: 0, to: running, running };
    }
    if (step.kind === "minus") {
      const next = running - Math.abs(step.amount);
      const r = { step, from: Math.min(next, running), to: Math.max(next, running), running: next };
      running = next;
      return r;
    }
    return { step, from: 0, to: step.amount, running: step.amount };
  });
  const max = Math.max(1, ...raw.map((r) => r.to));
  return raw.map((r) => ({
    step: r.step,
    fromPct: clamp((Math.max(0, r.from) / max) * 100, 0, 100),
    toPct: clamp((Math.max(0, r.to) / max) * 100, 0, 100),
    running: r.running,
  }));
}

// ---------- story strip ----------
export interface TimeScale {
  xOf: (ms: number) => number;
  /** Compressed empty stretches, centre x and width in px. */
  breaks: { x: number; width: number }[];
}

/**
 * Gap-compressed time scale over [pad, width-pad]. Any empty stretch between consecutive anchor times
 * longer than `gapDays` takes at most `maxGapFrac` of the inner width, so dense stretches get the room.
 * Monotonic non-decreasing in time.
 */
export function compressedScale(
  anchors: number[],
  opts: { width: number; pad?: number; gapDays?: number; maxGapFrac?: number },
): TimeScale {
  const { width, pad = 40, gapDays = 120, maxGapFrac = 0.08 } = opts;
  const t = [...new Set(anchors.filter((n) => Number.isFinite(n)))].sort((a, b) => a - b);
  const inner = Math.max(1, width - 2 * pad);
  if (t.length === 0) return { xOf: () => pad, breaks: [] };
  if (t.length === 1) return { xOf: () => pad, breaks: [] };
  const gaps = t.slice(1).map((v, i) => v - t[i]!);
  const isLong = gaps.map((g) => g > gapDays * DAY_MS);
  const cap = inner * maxGapFrac;
  const normalSpan = gaps.reduce((s, g, i) => (isLong[i] ? s : s + g), 0);
  const nLong = isLong.filter(Boolean).length;
  const longW = gaps.map(() => 0);
  let s = normalSpan > 0 ? inner / (normalSpan + gaps.reduce((a, g, i) => (isLong[i] ? a + g : a), 0)) : 0;
  for (let it = 0; it < 8; it++) {
    gaps.forEach((g, i) => { if (isLong[i]) longW[i] = Math.min(cap, g * s); });
    const used = longW.reduce((a, b) => a + b, 0);
    s = normalSpan > 0 ? Math.max(0, inner - used) / normalSpan : 0;
  }
  if (normalSpan === 0) gaps.forEach((_, i) => { if (isLong[i]) longW[i] = Math.min(cap, inner / Math.max(1, nLong)); });
  const widths = gaps.map((g, i) => (isLong[i] ? longW[i]! : g * s));
  const xs = [pad];
  widths.forEach((w) => xs.push(xs[xs.length - 1]! + w));
  const xOf = (ms: number): number => {
    if (ms <= t[0]!) return xs[0]!;
    if (ms >= t[t.length - 1]!) return xs[xs.length - 1]!;
    let lo = 0;
    let hi = t.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (t[mid]! <= ms) lo = mid; else hi = mid; }
    const f = (ms - t[lo]!) / (t[hi]! - t[lo]!);
    return xs[lo]! + f * (xs[hi]! - xs[lo]!);
  };
  const breaks = widths.flatMap((w, i) => (isLong[i] ? [{ x: xs[i]! + w / 2, width: w }] : []));
  return { xOf, breaks };
}

export interface StripCluster { x: number; events: TimelineEvent[] }

/** Merge dots closer than `minPx` to the previous one into a single cluster (count = events.length). */
export function clusterDots(points: { event: TimelineEvent; x: number }[], minPx = 8): StripCluster[] {
  const out: { xs: number[]; events: TimelineEvent[] }[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && p.x - last.xs[last.xs.length - 1]! < minPx) { last.xs.push(p.x); last.events.push(p.event); }
    else out.push({ xs: [p.x], events: [p.event] });
  }
  return out.map((c) => ({ x: c.xs.reduce((a, b) => a + b, 0) / c.xs.length, events: c.events }));
}

export interface StripBox { left: number; right: number; side: "above" | "below"; row: number }
export interface StripLabelItem { id: string; x: number; width: number }
/**
 * Greedy label placement. `items` are placed in the given order into the first free slot
 * (rows nearest the axis first, alternating sides). A slot is free when the box overlaps no other box in its row
 * (+`gap`) and the connector from the box to the axis crosses no nearer box. Unplaceable items get null.
 */
export function placeBoxes(
  items: StripLabelItem[],
  opts: { width: number; rowsAbove: number; rowsBelow: number; gap?: number },
): Map<string, StripBox | null> {
  const { width, rowsAbove, rowsBelow, gap = 8 } = opts;
  const placed: (StripBox & { cx: number })[] = [];
  const result = new Map<string, StripBox | null>();
  const slots: { side: "above" | "below"; row: number }[] = [];
  for (let r = 0; r < Math.max(rowsAbove, rowsBelow); r++) {
    if (r < rowsAbove) slots.push({ side: "above", row: r });
    if (r < rowsBelow) slots.push({ side: "below", row: r });
  }
  for (const it of items) {
    const left = Math.min(Math.max(it.x - it.width / 2, 0), Math.max(0, width - it.width));
    const right = left + it.width;
    const slot = slots.find(({ side, row }) => placed.every((p) => {
      if (p.side !== side) return true;
      if (p.row === row) return right + gap <= p.left || left - gap >= p.right;
      // connector of the farther box must not cross the nearer box
      const [near, far] = p.row < row ? [p, { left, right, cx: it.x }] : [{ left, right }, p];
      return !(far.cx >= near.left - 2 && far.cx <= near.right + 2);
    }));
    if (slot) { const b = { left, right, ...slot }; placed.push({ ...b, cx: it.x }); result.set(it.id, b); }
    else result.set(it.id, null);
  }
  return result;
}

export interface StripLabel extends StripBox { text: string; date: string }
export interface StripLayout {
  clusters: (StripCluster & { label: StripLabel | null })[];
  ticks: { x: number; label: string }[];
  today: { x: number; box: StripBox | null } | null;
  breaks: { x: number; width: number }[];
  rowsAbove: number;
  rowsBelow: number;
}

const clipText = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * Pixel layout of the story strip at its real `width`: gap-compressed time scale, dots merged under `clusterPx`,
 * labels assigned greedily to up to `rowsAbove`/`rowsBelow` rows, never overlapping (overflow labels are null).
 */
export function stripLayout(
  events: TimelineEvent[],
  opts: {
    width: number; pad?: number; now?: number; rowsAbove?: number; rowsBelow?: number;
    charW?: number; maxTitle?: number; clusterPx?: number; gapDays?: number; maxGapFrac?: number;
  },
): StripLayout {
  const { width, pad = 40, rowsAbove = 3, rowsBelow = 2, charW = 7, maxTitle = 26, clusterPx = 8 } = opts;
  const dated = events
    .map((e) => ({ e, ms: toMs(e.date) }))
    .filter((d) => !Number.isNaN(d.ms))
    .sort((a, b) => a.ms - b.ms);
  const empty: StripLayout = { clusters: [], ticks: [], today: null, breaks: [], rowsAbove, rowsBelow };
  if (!dated.length) return empty;
  const lo = dated[0]!.ms;
  let hi = dated[dated.length - 1]!.ms;
  const { now } = opts;
  const showToday = now != null && now > hi && now - hi < 2 * 365 * DAY_MS;
  if (showToday) hi = now!;
  const scale = compressedScale(dated.map((d) => d.ms).concat(showToday ? [now!] : []), { width, pad, gapDays: opts.gapDays, maxGapFrac: opts.maxGapFrac });
  const clusters = clusterDots(dated.map((d) => ({ event: d.e, x: scale.xOf(d.ms) })), clusterPx);

  const todayX = showToday ? scale.xOf(now!) : null;
  const items: StripLabelItem[] = [];
  const text = new Map<string, { text: string; date: string }>();
  // Today goes first so it always keeps a slot and no later label can cover it.
  if (todayX != null) items.push({ id: "today", x: todayX, width: 5 * charW + 12 });
  clusters.forEach((c, i) => {
    const first = c.events[0]!;
    const t = c.events.length > 1 ? `${c.events.length} events` : clipText(first.title, maxTitle);
    const d = c.events.length > 1 ? `${formatDate(first.date)} →` : `${formatDate(first.date)}${first.derivation === "inferred" ? " ~" : ""}`;
    text.set(String(i), { text: t, date: d });
    items.push({ id: String(i), x: c.x, width: Math.max(t.length, d.length * 0.9) * charW + 8 });
  });
  const boxes = placeBoxes(items, { width, rowsAbove, rowsBelow });

  const ticks: { x: number; label: string }[] = [];
  const y0 = new Date(lo).getUTCFullYear() + 1;
  const y1 = new Date(hi).getUTCFullYear();
  for (let y = y0; y <= y1; y++) {
    const x = scale.xOf(Date.UTC(y, 0, 1));
    const lastTick = ticks[ticks.length - 1];
    if (clusters.some((c) => Math.abs(c.x - x) < 14) || (todayX != null && Math.abs(todayX - x) < 30)) continue;
    if (lastTick && x - lastTick.x < 40) continue;
    ticks.push({ x, label: String(y) });
  }
  return {
    clusters: clusters.map((c, i) => {
      const b = boxes.get(String(i));
      return { ...c, label: b ? { ...b, ...text.get(String(i))! } : null };
    }),
    ticks,
    today: todayX != null ? { x: todayX, box: boxes.get("today") ?? null } : null,
    breaks: scale.breaks,
    rowsAbove,
    rowsBelow,
  };
}

// ---------- injuries ----------
export function groupInjuries(injuries: Injury[]): { bodyPart: string; injuries: Injury[] }[] {
  const order: string[] = [];
  const map = new Map<string, Injury[]>();
  for (const i of injuries) {
    const key = i.bodyPart?.trim() || "Other";
    if (!map.has(key)) { map.set(key, []); order.push(key); }
    map.get(key)!.push(i);
  }
  const rank = { "surgery-done": 0, "surgery-recommended": 1, diagnosed: 2 } as const;
  return order.map((bodyPart) => ({
    bodyPart,
    injuries: [...map.get(bodyPart)!].sort((a, b) => rank[a.status] - rank[b.status]),
  }));
}

// ---------- everything table ----------
export type TimelineSortKey = "date" | "title" | "category";
export function sortFilterTimeline(
  events: TimelineEvent[],
  opts: { sort: TimelineSortKey; dir: "asc" | "desc"; query?: string; category?: string | null },
): TimelineEvent[] {
  const q = opts.query?.trim().toLowerCase() ?? "";
  const filtered = events.filter((e) =>
    (!opts.category || e.category === opts.category) &&
    (!q || e.title.toLowerCase().includes(q) || e.refs.some((r) => (r.quote ?? r.value).toLowerCase().includes(q))),
  );
  const sign = opts.dir === "asc" ? 1 : -1;
  return [...filtered].sort((a, b) => {
    const c = opts.sort === "date"
      ? toMs(a.date) - toMs(b.date)
      : a[opts.sort].localeCompare(b[opts.sort]);
    return c !== 0 ? c * sign : toMs(a.date) - toMs(b.date);
  });
}

// ---------- bills ----------
export function billBars<T extends { amount: number }>(bills: T[]): { bill: T; pct: number }[] {
  const sorted = [...bills].sort((a, b) => b.amount - a.amount);
  const max = Math.max(1, ...sorted.map((b) => b.amount));
  return sorted.map((bill) => ({ bill, pct: clamp((bill.amount / max) * 100, 0, 100) }));
}
