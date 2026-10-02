// Builds the landing-page overview from OUR DB only (digests, item_events, view_state, shares).
// The only Clio data is the matter list the route passes in. Never logs record text.
import { repos } from "@/lib/db";
import { buildShareSummaries } from "@/lib/server/shares";
import type { ActionItem, Digest, Kpi, KpiKey, MatterSummary, ShareResponse, ShareSummary, StageKey } from "@/lib/types";

const DAY_MS = 86_400_000;
const OVERVIEW_KPIS: KpiKey[] = ["case_value", "coverage", "specials", "next_deadline", "last_client_contact"];
const REPLY_MAX = 160;

export type OverviewKpi = Pick<Kpi, "key" | "label" | "display" | "value" | "unit" | "status"> & { range?: Kpi["range"] };

export interface AttentionItem {
  kind: "overdue" | "waiting";
  title: string;
  dueAt: string | null;
  daysLate: number | null;
  daysSilent: number | null;
  waitingOn: string | null;
  drawerKey: string | null;
}

export interface OverviewDigest {
  version: number;
  builtAt: string;
  costUsd: number;
  stage: { key: StageKey; label: string };
  kpis: OverviewKpi[];
  overdue: number;
  upcoming7d: number;
  waiting: number;
  newSinceOpen: number | null;          // null = this viewer never opened the matter
  topAttention: AttentionItem[];        // <= 3, overdue first then waiting
}

export interface ShareReply {
  recipientLabel: string;
  kind: ShareResponse["kind"];
  promisedDate: string | null;
  text: string | null;                  // provider-written, truncated
  at: string;
}

export interface ShareActivity { kind: "opened" | "replied"; recipientLabel: string; at: string; reply: ShareReply | null }

export interface OverviewShares {
  total: number;                        // live (not revoked) shares
  opened: number;                       // live shares with at least one view
  lastViewedAt: string | null;
  latestReply: ShareReply | null;
  recent: ShareActivity[];              // newest first, <= 5
}

export interface MatterOverview { matter: MatterSummary; digest: OverviewDigest | null; shares: OverviewShares }
export interface MattersOverviewResponse { matters: MatterOverview[]; generatedAt: string }

const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dueDay = (a: ActionItem) => (a.due ? a.due.slice(0, 10) : null);

/** Re-bucket the digest's action board against `now`: an "upcoming" item whose date passed is overdue now. */
export function bucketActions(board: Digest["actionBoard"], now: number): { overdue: ActionItem[]; upcoming7d: ActionItem[]; waiting: ActionItem[] } {
  const today = dayKey(now);
  const horizon = dayKey(now + 7 * DAY_MS);
  const lateUpcoming = board.upcoming.filter((a) => { const d = dueDay(a); return d != null && d < today; });
  const overdue = [...board.overdue, ...lateUpcoming].map((a) => {
    const d = dueDay(a);
    return d ? { ...a, daysLate: Math.max(0, Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / DAY_MS)) } : a;
  });
  const upcoming7d = board.upcoming.filter((a) => { const d = dueDay(a); return d != null && d >= today && d <= horizon; });
  return { overdue, upcoming7d, waiting: board.waiting };
}

/** Up to `max` attention rows: overdue (most late first), then waiting (longest silence first). */
export function topAttention(overdue: ActionItem[], waiting: ActionItem[], max = 3): AttentionItem[] {
  const o = [...overdue].sort((a, b) => (b.daysLate ?? 0) - (a.daysLate ?? 0)).map((a): AttentionItem => ({
    kind: "overdue", title: a.title, dueAt: a.due, daysLate: a.daysLate ?? null, daysSilent: null,
    waitingOn: a.waitingOn?.name ?? null, drawerKey: a.refs[0]?.drawerKey ?? null,
  }));
  const w = [...waiting].sort((a, b) => (b.waitingOn?.daysSilent ?? -1) - (a.waitingOn?.daysSilent ?? -1)).map((a): AttentionItem => ({
    kind: "waiting", title: a.title, dueAt: a.due, daysLate: null, daysSilent: a.waitingOn?.daysSilent ?? null,
    waitingOn: a.waitingOn?.name ?? null, drawerKey: a.refs[0]?.drawerKey ?? null,
  }));
  const seen = new Set<string>();
  const out: AttentionItem[] = [];
  for (const it of [...o, ...w]) {
    const k = it.drawerKey ?? `${it.kind}:${it.title}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
    if (out.length >= max) break;
  }
  return out;
}

function pickKpis(kpis: Kpi[]): OverviewKpi[] {
  return OVERVIEW_KPIS.flatMap((key) => {
    const k = kpis.find((x) => x.key === key);
    if (!k) return [];
    const slim: OverviewKpi = { key: k.key, label: k.label, display: k.display, value: k.value, unit: k.unit, status: k.status };
    if (k.range) slim.range = k.range;
    return [slim];
  });
}

function toReply(label: string, r: ShareResponse): ShareReply {
  const text = r.text ? (r.text.length > REPLY_MAX ? `${r.text.slice(0, REPLY_MAX - 1)}…` : r.text) : null;
  return { recipientLabel: label, kind: r.kind, promisedDate: r.promisedDate, text, at: r.createdAt };
}

export function summarizeShares(list: ShareSummary[]): OverviewShares {
  const live = list.filter((s) => !s.revokedAt);
  const lastViewedAt = live.map((s) => s.lastViewedAt).filter((x): x is string => !!x).sort().at(-1) ?? null;
  const replies = live.flatMap((s) => s.responses.map((r) => toReply(s.recipientLabel, r))).sort((a, b) => b.at.localeCompare(a.at));
  const opens: ShareActivity[] = live.filter((s) => s.lastViewedAt).map((s) => ({ kind: "opened", recipientLabel: s.recipientLabel, at: s.lastViewedAt!, reply: null }));
  const recent = [...opens, ...replies.map((r): ShareActivity => ({ kind: "replied", recipientLabel: r.recipientLabel, at: r.at, reply: r }))]
    .sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5);
  return { total: live.length, opened: live.filter((s) => s.views > 0).length, lastViewedAt, latestReply: replies[0] ?? null, recent };
}

export function summarizeDigest(d: Digest, newSinceOpen: number | null, costUsd: number, now: number): OverviewDigest {
  const b = bucketActions(d.actionBoard, now);
  return {
    version: d.version,
    builtAt: d.meta?.builtAt ?? d.createdAt,
    costUsd,
    stage: { key: d.stage.key, label: d.stage.label },
    kpis: pickKpis(d.kpis ?? []),
    overdue: b.overdue.length,
    upcoming7d: b.upcoming7d.length,
    waiting: b.waiting.length,
    newSinceOpen,
    topAttention: topAttention(b.overdue, b.waiting),
  };
}

/** DB-only per-matter overview. `viewerId` null = no cookie yet, so "new since open" is unknown. */
export function buildOverview(matters: MatterSummary[], viewerId: string | null, now: number = Date.now()): MattersOverviewResponse {
  const r = repos();
  return {
    generatedAt: new Date(now).toISOString(),
    matters: matters.map((matter) => {
      const d = r.digests.latest(matter.clioId);
      let digest: OverviewDigest | null = null;
      if (d) {
        const vs = viewerId ? r.viewState.get(viewerId, matter.clioId) : null;
        const newSinceOpen = vs ? r.events.listAfter(matter.clioId, vs.lastOpenedAt, 999).length : null;
        digest = summarizeDigest(d, newSinceOpen, d.meta?.costUsd ?? 0, now);
      }
      return { matter, digest, shares: summarizeShares(buildShareSummaries(matter.clioId)) };
    }),
  };
}
