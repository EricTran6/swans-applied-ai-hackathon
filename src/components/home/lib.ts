// Pure helpers for the landing dashboard. No React, no case data: unit-tested in lib.test.ts.
import type { MatterSummary, StageKey } from "@/lib/types";
import type { AttentionItem, MatterOverview, OverviewDigest, ShareActivity, ShareReply } from "@/app/api/matters/overview/route";
import { formatDate, relativeTime } from "@/components/brief/lib";

// ---------- today strip ----------
export type TileKey = "overdue" | "upcoming7d" | "waiting" | "sharesOpened";
export interface TodayTile { key: TileKey; label: string; total: number; matters: MatterSummary[] }

const TILE_LABELS: Record<TileKey, string> = {
  overdue: "Overdue", upcoming7d: "Due in 7 days", waiting: "Waiting on others", sharesOpened: "Provider shares opened",
};

function tileCount(key: TileKey, m: MatterOverview): number {
  if (key === "sharesOpened") return m.shares.opened;
  return m.digest ? m.digest[key] : 0;
}

/** Sum each stat across matters and keep the matters that contribute to it (in input order). */
export function todayTiles(list: MatterOverview[]): TodayTile[] {
  return (Object.keys(TILE_LABELS) as TileKey[]).map((key) => {
    const contributing = list.filter((m) => tileCount(key, m) > 0);
    return {
      key, label: TILE_LABELS[key],
      total: contributing.reduce((s, m) => s + tileCount(key, m), 0),
      matters: contributing.map((m) => m.matter),
    };
  });
}

export function matterHref(m: Pick<MatterSummary, "clioId">): string {
  return `/matters/${encodeURIComponent(m.clioId)}`;
}

// ---------- stage rail ----------
export const RAIL_STEPS = ["Intake", "Treating", "Records", "Demand", "Negotiation", "Litigation", "Resolved"] as const;
const RAIL_INDEX: Record<StageKey, number> = {
  intake: 0, treatment: 1, records: 2, demand: 3, negotiation: 4,
  pleadings: 5, discovery: 5, mediation: 5, trial: 5, settlement: 6, disbursement: 6, closed: 6,
};
/** Index into RAIL_STEPS for a digest stage key; unknown keys sit at the start. */
export function railIndex(key: StageKey | string | null | undefined): number {
  return key && key in RAIL_INDEX ? RAIL_INDEX[key as StageKey] : 0;
}

// ---------- value vs coverage mini bar ----------
export interface MiniBar { valuePct: number; capPct: number | null; over: boolean }
/** 0..max scaled to the larger of value and coverage; `over` = value exceeds coverage. Null when neither is known. */
export function miniValueBar(value: number | null | undefined, cap: number | null | undefined): MiniBar | null {
  const v = value != null && Number.isFinite(value) && value > 0 ? value : null;
  const c = cap != null && Number.isFinite(cap) && cap > 0 ? cap : null;
  if (v == null && c == null) return null;
  const max = Math.max(v ?? 0, c ?? 0);
  const pct = (n: number) => Math.round((n / max) * 1000) / 10;
  return { valuePct: v == null ? 0 : pct(v), capPct: c == null ? null : pct(c), over: v != null && c != null && v > c };
}

// ---------- grid ----------
/** Single matter becomes a 2-column hero; otherwise 1 / 2 / 3 columns by breakpoint. */
export function gridMode(count: number): "hero" | "grid" {
  return count === 1 ? "hero" : "grid";
}

// ---------- text ----------
export function digestFooter(d: Pick<OverviewDigest, "version" | "builtAt" | "costUsd">, now: number): string {
  return `Digest v${d.version} · built ${relativeTime(d.builtAt, now)} · $${d.costUsd.toFixed(2)}`;
}

export function attentionMeta(a: AttentionItem): string {
  if (a.kind === "overdue") {
    const late = a.daysLate == null ? "Overdue" : a.daysLate === 0 ? "Due today" : `${a.daysLate} day${a.daysLate === 1 ? "" : "s"} late`;
    return a.dueAt ? `${late} · due ${formatDate(a.dueAt, { year: false })}` : late;
  }
  const who = a.waitingOn ? `Waiting on ${a.waitingOn}` : "Waiting";
  return a.daysSilent == null ? who : `${who} · silent ${a.daysSilent} day${a.daysSilent === 1 ? "" : "s"}`;
}

export function replyText(r: ShareReply): string {
  if (r.kind === "will_send") return r.promisedDate ? `Will send by ${formatDate(r.promisedDate, { year: false })}` : "Will send";
  if (r.kind === "sent") return r.text ? `Sent: ${r.text}` : "Marked as sent";
  return r.text ?? "Left a note";
}

/** "10:42" when `iso` is the same calendar day as `now` (in `timeZone`), else "Sep 12". */
export function formatClock(iso: string, now: number, timeZone?: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const day = (t: number) => new Date(t).toLocaleDateString("en-CA", { timeZone });
  if (day(ms) === day(now)) {
    return new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone });
  }
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone });
}

// ---------- provider activity feed ----------
export interface FeedEntry { matter: MatterSummary; activity: ShareActivity }
/** Latest share opens and replies across matters, newest first. */
export function activityFeed(list: MatterOverview[], max = 8): FeedEntry[] {
  return list
    .flatMap((m) => m.shares.recent.map((activity) => ({ matter: m.matter, activity })))
    .sort((a, b) => b.activity.at.localeCompare(a.activity.at))
    .slice(0, max);
}
