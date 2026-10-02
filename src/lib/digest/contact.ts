// Client snapshot and last-client-contact KPI.
import type { ClientSnapshot, ClioRecord, Contact, Kpi, Matter, SourceRef } from "@/lib/types";
import { byType, clientContact, commInvolves, daysBetween, dayKey, firstSentence, metaRef, nameTokens, normText } from "./util";

type ClientId = { clioId: string; name: string };
const TREATMENT_RE = /\b(treat|treatment|therapy|pt|physical therapy|appointment|visit|exam|follow[- ]?up|surgery|mri|chiro)/i;

export function clientIdentity(matter: Matter, records: ClioRecord[]): { id: ClientId; contact: Contact | null } {
  const contact = clientContact(records, matter.client.contactId);
  return { id: { clioId: matter.client.contactId ?? contact?.clioId ?? "", name: matter.client.name }, contact };
}

/** Text says the client reached out by phone, e.g. "<first name> called", "client phoned", "client left a voicemail". */
function noteSaysClientCalled(text: string, client: ClientId, contact: Contact | null): boolean {
  const names = ["client", ...nameTokens(client.name), ...(contact?.firstName ? [normText(contact.firstName)] : [])];
  const t = normText(text);
  return names.some((n) => new RegExp(`\\b${n.replace(/[^a-z0-9]/g, "")}\\b (called|phoned|rang|left (a )?(voicemail|message)|returned (my|our) call)`).test(t));
}

export function lastClientContact(matter: Matter, records: ClioRecord[], now: Date): ClientSnapshot["lastContact"] {
  const { id, contact } = clientIdentity(matter, records);
  const cands: { date: string; kind: string; rec: ClioRecord }[] = [];
  for (const c of byType(records, "communication")) {
    const d = dayKey(c.occurredAt || c.sourceDate);
    if (d && commInvolves(c, id)) cands.push({ date: d, kind: c.kind, rec: c });
  }
  for (const n of byType(records, "note")) {
    const d = dayKey(n.date ?? n.sourceDate);
    if (d && noteSaysClientCalled(`${n.subject}. ${n.bodyText}`, id, contact)) cands.push({ date: d, kind: "Note", rec: n });
  }
  const today = dayKey(now.toISOString())!;
  const best = cands.filter((c) => c.date <= today).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!best) return null;
  const ref: SourceRef = metaRef(best.rec, best.date);
  return { date: best.date, kind: best.kind, daysAgo: daysBetween(best.date, today),
    summary: firstSentence(best.rec.bodyText || best.rec.title), ref };
}

export function lastContactKpi(lc: ClientSnapshot["lastContact"], asOf: string): Kpi {
  const base = { key: "last_client_contact" as const, label: "Last client contact", unit: "days" as const, asOf, computedBy: "code" as const };
  if (!lc) return { ...base, display: "Not recorded in Clio", value: null, status: "unknown", refs: [] };
  const kind = lc.kind === "Phone" ? "call" : lc.kind.toLowerCase();
  return { ...base, value: lc.daysAgo,
    display: `${lc.daysAgo === 0 ? "today" : lc.daysAgo === 1 ? "1 day ago" : `${lc.daysAgo} days ago`} (${kind})`,
    status: lc.daysAgo <= 14 ? "ok" : lc.daysAgo <= 30 ? "warn" : "danger", refs: [lc.ref] };
}

export function clientSnapshot(matter: Matter, records: ClioRecord[], now: Date,
  lastContact: ClientSnapshot["lastContact"]): ClientSnapshot {
  const { id, contact } = clientIdentity(matter, records);
  const name = contact?.name ?? matter.client.name;
  const initials = contact?.initials || nameTokens(name).slice(0, 2).map((t) => t[0].toUpperCase()).join("")
    || name.slice(0, 2).toUpperCase();
  const today = dayKey(now.toISOString())!;
  let age: number | null = null;
  const dob = dayKey(contact?.dateOfBirth ?? null);
  if (dob) {
    age = +today.slice(0, 4) - +dob.slice(0, 4);
    if (today.slice(5) < dob.slice(5)) age--;
  }
  const clientWords = [...nameTokens(id.name), "client"];
  const next = byType(records, "calendar_entry")
    .map((e) => ({ e, d: dayKey(e.startAt) }))
    .filter(({ e, d }) => d && d >= today && (TREATMENT_RE.test(`${e.summary} ${e.description}`)
      || clientWords.some((w) => normText(`${e.summary} ${e.description}`).split(/[^a-z0-9]+/).includes(w))))
    .sort((a, b) => a.d!.localeCompare(b.d!))[0];
  return {
    name, initials, age, avatarUrl: contact?.avatarUrl ?? null, lastContact,
    nextTouchpoint: next ? { date: next.d!, title: next.e.summary, ref: metaRef(next.e, next.d!) } : null,
    statusChips: [],
  };
}
