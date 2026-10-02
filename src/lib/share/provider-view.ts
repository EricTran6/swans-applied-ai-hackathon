// Builds the frozen, provider-facing ProviderView for one recipient. Every field is templated from
// structure; nothing from notes, no Clio ids, no dollars except the recipient's own bill and
// (only when toggled) coverage limits. Hard-deny and out-of-scope ids are refused even if passed.
import type { CalendarEntry, ClioRecord, Contact, Digest, ProviderView, StageKey } from "@/lib/types";
import {
  buildContext, buildItems, ID_COVERAGE, ID_COVERAGE_LIMITS, ID_OWN_BILL, ID_STATUS, inScope, isKnownCategory, type ShareItem,
} from "./candidates";
import { roleLabel } from "./scope";
import { isProviderSafe } from "./templates";

const DAY_MS = 86_400_000;
export const STALE_BILL_DAYS = 90;
export const ACTIVE_WINDOW_DAYS = 30;
export const MAX_ATTORNEY_NOTE = 1000;
export const MAX_PROVIDER_UPDATES = 5;

const dateOnly = (s: string | null | undefined): string | null => (s ? s.slice(0, 10) : null);
const daysBetween = (a: Date, b: Date) => Math.floor((a.getTime() - b.getTime()) / DAY_MS);

export function stageLabel(key: StageKey | string | undefined, matterStatus: string | null): ProviderView["stage"]["label"] {
  if (matterStatus === "Closed" || key === "closed") return "Closed";
  switch (key) {
    case "settlement": case "disbursement": return "Settled / paying liens";
    case "pleadings": case "discovery": case "mediation": case "trial": return "In litigation";
    case "demand": case "negotiation": return "Pre-suit negotiation";
    default: return "Treating";
  }
}

export function clientDisplayName(client: Contact | null, headerName: string): string {
  const first = client?.firstName?.trim() || headerName.trim().split(/\s+/)[0] || "";
  const last = client?.lastName?.trim() || headerName.trim().split(/\s+/).slice(1).pop() || "";
  const initial = last ? ` ${last.charAt(0).toUpperCase()}.` : "";
  return `${first}${initial}`.trim() || "Client";
}

function fmtLimit(n: number | null): string | null {
  return n == null ? null : `$${Math.round(n).toLocaleString("en-US")}`;
}

/** Which of the requested ids this recipient may actually receive (fail closed). */
export function admissibleIds(items: ShareItem[], includedIds: string[], recipientContactId: string | null): Set<string> {
  const byId = new Map(items.map((i) => [i.id, i]));
  const out = new Set<string>();
  for (const id of includedIds) {
    const it = byId.get(id);
    if (!it || it.hardDeny || !isKnownCategory(it.category) || !inScope(it, recipientContactId)) continue;
    out.add(id);
  }
  return out;
}

/** Opaque per-share need id ("need-1"...) -> internal candidate id ("task:<clioId>"). Server-side only. */
export type NeedMap = Record<string, string>;

export function buildProviderView(d: Digest, records: ClioRecord[], includedIds: string[],
  recipient: { label: string; contactId: string | null }, attorneyNote: string | null, now: Date): ProviderView {
  return buildProviderShare(d, records, includedIds, recipient, attorneyNote, now).view;
}

/** The provider view plus the server-side need-id map (store it, never send it). */
export function buildProviderShare(d: Digest, records: ClioRecord[], includedIds: string[],
  recipient: { label: string; contactId: string | null }, attorneyNote: string | null, now: Date): { view: ProviderView; needMap: NeedMap } {
  const rid = recipient.contactId;
  const ctx = buildContext(records, rid);
  const items = buildItems(d, records, rid, ctx);
  const ok = admissibleIds(items, includedIds, rid);
  const has = (id: string) => ok.has(id);
  const chosen = items.filter((i) => has(i.id));
  const ttlDays = Number(process.env.SHARE_TTL_DAYS) > 0 ? Number(process.env.SHARE_TTL_DAYS) : 7;

  // status
  const matterStatus = ctx.matter?.status ?? d.header.status ?? null;
  // Business dates only: createdAt/updatedAt/completedAt are seed time in demo data (types.ts warning).
  const activityDates = records
    .filter((r) => ["note", "communication", "calendar_entry"].includes(r.sourceType))
    .map((r) => dateOnly(r.sourceDate))
    .filter((x): x is string => !!x && new Date(x) <= now)
    .sort();
  const lastFirmActivity = activityDates.length ? activityDates[activityDates.length - 1] : null;
  const alive: ProviderView["status"]["alive"] = matterStatus === "Closed" ? "closed"
    : lastFirmActivity && daysBetween(now, new Date(lastFirmActivity)) <= ACTIVE_WINDOW_DAYS ? "active" : "stalled";
  const future = records
    .filter((r): r is CalendarEntry => r.sourceType === "calendar_entry" && new Date(r.startAt) >= now)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));

  // appointments (future, this provider's own treatment entries that the attorney included)
  const appointments = chosen
    .flatMap((i) => (i.payload.kind === "calendar" && rid && i.providerContactId === rid ? [i.payload.entry] : []))
    .filter((e) => new Date(e.startAt) >= now)
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
    .map((e) => ({ title: "Client treatment", date: dateOnly(e.startAt) ?? "" }));

  // nextEvent: only the recipient's own shared treatment appointment, never court/IME/other providers' dates
  const status: ProviderView["status"] = has(ID_STATUS)
    ? { label: alive === "active" ? "Active" : alive === "closed" ? "Closed" : "No recent activity", alive,
        lastFirmActivity, nextEvent: appointments[0]?.date || null }
    : { label: "Not shared", alive, lastFirmActivity: null, nextEvent: null };

  // coverage
  let coverage: ProviderView["coverage"] = null;
  if (has(ID_COVERAGE)) {
    const kpi = d.kpis.find((k) => k.key === "coverage");
    const confirmed = ctx.limitsConfirmed || kpi?.status === "ok";
    const confirmedOn = confirmed
      ? (kpi?.refs.map((r) => dateOnly(r.sourceDate)).filter((x): x is string => !!x).sort().pop() ?? null) : null;
    let layers: { kind: string; limit: string }[] | null = null;
    if (has(ID_COVERAGE_LIMITS)) {
      layers = d.coverage
        .filter((l) => l.kind === "BI" || l.kind === "Umbrella")
        .map((l) => ({ kind: l.kind === "BI" ? "Liability" : l.kind, limit: fmtLimit(l.perPerson) ?? fmtLimit(l.perAccident) ?? "" }))
        .filter((l) => l.limit !== "");
      if (layers.length === 0) layers = null;
    }
    coverage = { confirmed, confirmedOn, layers };
  }

  // needs (open tasks naming this provider), templated
  // ids are opaque per share; the mapping back to the task stays server-side (needMap)
  const needMap: NeedMap = {};
  const needs = chosen.flatMap((i) => (i.payload.kind === "task" && i.providerContactId === rid
    ? [{ key: i.id, text: i.preview.replace(/\s*\(due [^)]*\)\s*$/, ""), due: dateOnly(i.payload.task.dueAt) }] : []))
    .filter((n) => isProviderSafe(n.text))
    .map((n, idx) => {
      const id = `need-${idx + 1}`;
      needMap[id] = n.key;
      return { id, text: n.text, due: n.due };
    });

  // own bill
  const billItem = chosen.find((i) => i.id === ID_OWN_BILL && i.payload.kind === "bill");
  let bill: ProviderView["bill"] = null;
  if (billItem && billItem.payload.kind === "bill" && billItem.providerContactId === rid && rid) {
    const through = billItem.payload.servicesThrough ?? billItem.payload.billDate;
    const treatmentContinues = future.some((e) => /treatment|therap|chiro|visit|appointment|follow.?up|surg/i.test(e.summary));
    const stale = !!through && treatmentContinues && daysBetween(now, new Date(through)) > STALE_BILL_DAYS;
    bill = { amount: billItem.payload.amount, servicesThrough: billItem.payload.servicesThrough, stale };
  }

  // records (own records/bill docs, plus explicitly opted-in other records)
  const records_ = chosen
    .flatMap((i) => (i.payload.kind === "document" ? [{ p: i.payload, own: i.providerContactId === rid }] : []))
    .map(({ p, own }) => ({
      name: p.isBill ? "Itemized bill" : own ? `${ctx.recipient ? roleLabel(ctx.recipient) : "Treatment"} records` : `${p.providerName ?? "Treatment"} records`,
      date: p.doc.receivedAt ?? dateOnly(p.doc.sourceDate),
    }))
    .filter((r) => isProviderSafe(r.name));

  // updates: every stage/coverage milestone (unscoped) plus the MAX_PROVIDER_UPDATES newest correspondence
  // lines with this provider; newest first, deduped by text
  const seen = new Set<string>();
  let ownCount = 0;
  const updates = chosen
    .flatMap((i) => (i.payload.kind === "update" && (i.providerContactId == null || (rid && i.providerContactId === rid))
      ? [{ ...i.payload, own: i.providerContactId != null }] : []))
    .filter((u) => u.date && isProviderSafe(u.text))
    .sort((a, b) => b.date.localeCompare(a.date))
    .filter((u) => { if (seen.has(u.text)) return false; seen.add(u.text); return true; }) // newest per text
    .filter((u) => !u.own || ++ownCount <= MAX_PROVIDER_UPDATES)
    .map((u) => ({ date: u.date, text: u.text }));

  const view: ProviderView = {
    firmName: process.env.FIRM_NAME?.trim() || "Your law firm",
    recipientLabel: recipient.label,
    clientDisplayName: clientDisplayName(ctx.client, d.header.clientName),
    attorneyNote: attorneyNote ? attorneyNote.trim().slice(0, MAX_ATTORNEY_NOTE) || null : null,
    status,
    stage: { label: stageLabel(d.stage?.key, matterStatus) },
    coverage,
    needs,
    bill,
    appointments,
    records: records_,
    updates,
    sharedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlDays * DAY_MS).toISOString(),
  };

  // care team / findings: opt-in AND HIPAA authorization on file
  if (ctx.hipaaOnFile) {
    const careTeam = chosen.flatMap((i) => (i.payload.kind === "careteam" ? [{ name: i.payload.name, role: i.payload.role }] : []))
      .filter((c) => isProviderSafe(c.name) && isProviderSafe(c.role));
    const findings = chosen.flatMap((i) => (i.payload.kind === "finding" ? [{ text: i.payload.text, source: i.payload.source }] : []))
      .filter((f) => isProviderSafe(f.text) && isProviderSafe(f.source));
    if (careTeam.length) view.careTeam = careTeam;
    if (findings.length) view.findings = findings;
  }
  return { view, needMap };
}

