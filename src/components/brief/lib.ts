// Pure helpers for the attorney brief UI. No React, no case data: unit-tested in lib.test.ts.
import type { Digest, Injury, SourceRef, TimelineEvent, WaterfallStep } from "@/lib/types";
import type { RecoveryLine } from "@/lib/digest/recovery";

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
export interface StripPoint { event: TimelineEvent; x: number; lane: number }
export interface StripLayout {
  points: StripPoint[];
  ticks: { x: number; label: string }[];   // year boundaries
  today: number | null;                    // x of "today" if within range
  lanes: number;
}

/**
 * Time-scaled x positions for milestones in a strip of `width` px (with `pad` px margins).
 * Labels that would collide (closer than `minGap`) are pushed to the next lane (max `maxLanes`).
 */
export function stripLayout(
  events: TimelineEvent[],
  opts: { width: number; pad?: number; minGap?: number; maxLanes?: number; now?: number },
): StripLayout {
  const { width, pad = 60, minGap = 120, maxLanes = 3 } = opts;
  const dated = events
    .map((e) => ({ e, ms: toMs(e.date) }))
    .filter((d) => !Number.isNaN(d.ms))
    .sort((a, b) => a.ms - b.ms);
  if (!dated.length) return { points: [], ticks: [], today: null, lanes: 0 };
  const now = opts.now;
  const lo = dated[0]!.ms;
  let hi = dated[dated.length - 1]!.ms;
  if (now != null && now > hi && now - hi < 2 * 365 * DAY_MS) hi = now;
  const span = Math.max(hi - lo, DAY_MS);
  const inner = Math.max(1, width - 2 * pad);
  const xOf = (ms: number) => pad + ((ms - lo) / span) * inner;

  const lastXInLane: number[] = [];
  const points = dated.map(({ e, ms }) => {
    const x = xOf(ms);
    let lane = lastXInLane.findIndex((lx) => x - lx >= minGap);
    if (lane === -1) lane = lastXInLane.length < maxLanes ? lastXInLane.length : leastRecent(lastXInLane);
    lastXInLane[lane] = x;
    return { event: e, x, lane };
  });

  const ticks: { x: number; label: string }[] = [];
  const y0 = new Date(lo).getUTCFullYear() + 1;
  const y1 = new Date(hi).getUTCFullYear();
  for (let y = y0; y <= y1; y++) ticks.push({ x: xOf(Date.UTC(y, 0, 1)), label: String(y) });

  return {
    points,
    ticks,
    today: now != null && now >= lo && now <= hi ? xOf(now) : null,
    lanes: Math.max(1, lastXInLane.length),
  };
}
function leastRecent(xs: number[]): number {
  let idx = 0;
  xs.forEach((x, i) => { if (x < xs[idx]!) idx = i; });
  return idx;
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

// ---------- recovery ----------
export interface RecoveryInputs {
  cap: number; capRefs: SourceRef[]; costs: RecoveryLine | null; liens: RecoveryLine[]; providers: RecoveryLine[];
}

/** Waterfall + bills -> recovery map inputs. Costs vs liens is decided by source (all-expense refs), never by label. */
export function recoveryInputs(d: Pick<Digest, "valueWaterfall" | "providerBills">): RecoveryInputs | null {
  const start = d.valueWaterfall.find((s) => s.kind === "start");
  if (!start || !Number.isFinite(start.amount)) return null;
  const minus = d.valueWaterfall.filter((s) => s.kind === "minus");
  const isCost = (s: WaterfallStep) => s.refs.length > 0 && s.refs.every((r) => r.sourceType === "expense");
  const toLine = (s: WaterfallStep): RecoveryLine => ({ label: s.label, amount: Math.abs(s.amount), refs: s.refs });
  const costSteps = minus.filter(isCost);
  return {
    cap: start.amount,
    capRefs: start.refs,
    costs: costSteps.length
      ? { label: "Firm costs", amount: costSteps.reduce((t, s) => t + Math.abs(s.amount), 0), refs: costSteps.flatMap((s) => s.refs) }
      : null,
    liens: minus.filter((s) => !isCost(s)).map(toLine),
    providers: d.providerBills.map((b) => ({ label: b.providerName, amount: b.amount, refs: b.refs })),
  };
}
