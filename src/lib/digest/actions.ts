// Action board (overdue / upcoming / waiting-on-others), next-deadline KPI and SOL status. Code only.
import type { ActionItem, CalendarEntry, ClioRecord, Contact, Digest, Kpi, Matter, SourceRef, Task, WaitingOn } from "@/lib/types";
import { clientIdentity } from "./contact";
import {
  addDays, byType, commInvolves, daysBetween, dayKey, isFirmParty, isOpenTask, mentionsName, metaRef, partyIs,
} from "./util";

const UPCOMING_DAYS = 30;
// Firm task-naming convention, used only as a fallback when no contact name matches.
const PROVIDER_PREFIX = /^\s*by\s+(medical\s+)?provider\s*:\s*/i;
const CLIENT_PREFIX = /^\s*(by|from)\s+client\s*:\s*/i;
// Appointments are not deadlines (they feed the client's next touchpoint instead).
const APPOINTMENT_RE = /\b(treatment|therapy|appointment|visit|session)\b/i;

const displayTitle = (name: string) => name.replace(PROVIDER_PREFIX, "").replace(CLIENT_PREFIX, "Client: ");

function kindOf(c: Contact): WaitingOn["kind"] {
  return c.roleKind === "provider" || c.roleKind === "client" || c.roleKind === "adverse" ? c.roleKind : "other";
}

/** Whom an open task is waiting on: a contact named in it or assigned to it, else the naming-convention prefix. */
function taskCounterparty(t: Task, contacts: Contact[], client: Contact | null, clientId: { clioId: string; name: string }):
  { name: string; contactId: string | null; kind: WaitingOn["kind"] } | null {
  const text = `${t.name} ${t.description}`;
  const assigned = t.assignee && t.assignee.kind !== "User" ? contacts.find((c) => partyIs(t.assignee!, c)) : undefined;
  const named = assigned ?? contacts.filter((c) => !c.isClient && mentionsName(text, c.name))
    .sort((a, b) => b.name.length - a.name.length)[0];
  if (named) return { name: named.name, contactId: named.clioId, kind: kindOf(named) };
  if (mentionsName(text, clientId.name) || CLIENT_PREFIX.test(t.name))
    return { name: client?.name ?? clientId.name, contactId: clientId.clioId || null, kind: "client" };
  if (PROVIDER_PREFIX.test(t.name)) {
    const rest = t.name.replace(PROVIDER_PREFIX, "");
    const p = contacts.find((c) => c.roleKind === "provider" && mentionsName(rest, c.name));
    if (p) return { name: p.name, contactId: p.clioId, kind: "provider" };
  }
  return null;
}

export const WAITING_WINDOW_DAYS = 180;
/** Outbound firm comms to the contact inside the unanswered window, which starts at the later of their last reply
 * and today - WAITING_WINDOW_DAYS (old, answered request cycles never count). A phone call with them is a reply. */
export function unanswered(records: ClioRecord[], who: { clioId: string; name: string }, today: string) {
  const comms = byType(records, "communication")
    .map((c) => ({ c, d: dayKey(c.occurredAt || c.sourceDate) }))
    .filter((x): x is { c: typeof x.c; d: string } => !!x.d && x.d <= today && commInvolves(x.c, who))
    .sort((a, b) => a.d.localeCompare(b.d));
  let lastReply = "";
  for (const { c, d } of comms)
    if (c.senders.some((p) => partyIs(p, who)) || /phone/i.test(c.kind)) lastReply = d;
  const floor = addDays(today, -WAITING_WINDOW_DAYS);
  const start = lastReply > floor ? lastReply : floor;
  return comms.filter(({ c, d }) => (d > start || (d === start && start === floor)) && !/phone/i.test(c.kind)
    && c.receivers.some((p) => partyIs(p, who)) && (c.senders.some(isFirmParty) || !c.senders.length));
}

function waitingOnFor(t: Task, records: ClioRecord[], matter: Matter, today: string): WaitingOn | undefined {
  const contacts = byType(records, "contact");
  const { id, contact } = clientIdentity(matter, records);
  const cp = taskCounterparty(t, contacts, contact, id);
  if (!cp) return undefined;
  const who = { clioId: cp.contactId ?? "", name: cp.name };
  const req = unanswered(records, who, today);
  if (!req.length) return undefined;
  return { ...cp, requests: req.length, daysSilent: daysBetween(req[0].d, today) };
}

const taskRef = (t: Task) => metaRef(t, dayKey(t.dueAt) ?? t.name);

export function actionBoard(matter: Matter, records: ClioRecord[], now: Date): Digest["actionBoard"] {
  const today = dayKey(now.toISOString())!;
  const horizon = addDays(today, UPCOMING_DAYS);
  const overdue: ActionItem[] = [], upcoming: ActionItem[] = [], waiting: ActionItem[] = [];
  for (const t of byType(records, "task")) {
    if (!isOpenTask(t.status)) continue;
    const due = dayKey(t.dueAt);
    const w = waitingOnFor(t, records, matter, today);
    const item: ActionItem = { id: t.drawerKey, title: displayTitle(t.name), due, owner: t.assignee?.name ?? null,
      origin: "clio-task", refs: [taskRef(t)], ...(w ? { waitingOn: w } : {}) };
    if (due && due < today) overdue.push({ ...item, daysLate: daysBetween(due, today) });
    else if (!w && due && due <= horizon) upcoming.push({ ...item, daysUntil: daysBetween(today, due) });
    if (w) waiting.push(item); // waiting-on items are not repeated under upcoming
  }
  for (const e of byType(records, "calendar_entry")) {
    const d = dayKey(e.startAt);
    if (!d || d < today || d > horizon) continue;
    upcoming.push({ id: e.drawerKey, title: e.summary, due: d, owner: null, origin: "clio-calendar",
      daysUntil: daysBetween(today, d), refs: [metaRef(e, d)] });
  }
  const byDue = (a: ActionItem, b: ActionItem) => (a.due ?? "9999").localeCompare(b.due ?? "9999");
  return { overdue: overdue.sort(byDue), upcoming: upcoming.sort(byDue), waiting: waiting.sort(byDue), suggested: [] };
}

export function nextDeadlineKpi(records: ClioRecord[], now: Date, asOf: string): Kpi {
  const today = dayKey(now.toISOString())!;
  const cands: { d: string; label: string; rec: Task | CalendarEntry }[] = [];
  for (const t of byType(records, "task")) {
    const d = dayKey(t.dueAt);
    if (d && d >= today && isOpenTask(t.status)) cands.push({ d, label: displayTitle(t.name), rec: t });
  }
  for (const e of byType(records, "calendar_entry")) {
    const d = dayKey(e.startAt);
    if (d && d >= today && !APPOINTMENT_RE.test(e.summary)) cands.push({ d, label: e.summary, rec: e });
  }
  const best = cands.sort((a, b) => a.d.localeCompare(b.d))[0];
  const base = { key: "next_deadline" as const, label: "Next deadline", unit: "date" as const, asOf, computedBy: "code" as const };
  if (!best) return { ...base, display: "Nothing scheduled", value: null, status: "unknown", refs: [] };
  const days = daysBetween(today, best.d);
  const md = new Date(`${best.d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return { ...base, display: `${md} · ${best.label}`, value: days,
    status: days <= 3 ? "danger" : days <= 7 ? "warn" : "ok", refs: [metaRef(best.rec, best.d)] };
}

/** SOL from the SOL task (preferred) or the matter's SOL field. Complete => satisfied, never overdue. */
export function solStatus(matter: Matter, records: ClioRecord[]): Digest["header"]["sol"] {
  const task = byType(records, "task").filter((t) => t.isSol && t.dueAt).sort((a, b) => b.dueAt!.localeCompare(a.dueAt!))[0];
  const done = (s: string | null | undefined) => !!s && !isOpenTask(s);
  const refs: SourceRef[] = [];
  if (task) refs.push(metaRef(task, done(task.status) ? "Satisfied" : dayKey(task.dueAt)!));
  if (matter.sol?.dueAt) refs.push(metaRef(matter, done(matter.sol.status) ? "Satisfied" : dayKey(matter.sol.dueAt)!));
  const date = dayKey(task?.dueAt ?? matter.sol?.dueAt ?? null);
  if (!date) return null;
  const satisfied = task ? done(task.status) : done(matter.sol?.status);
  return { date, status: satisfied ? "satisfied" : "open", refs };
}
