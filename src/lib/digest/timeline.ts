// Dated case timeline with generic PI milestone rules.
import { createHash } from "node:crypto";
import type { ClioRecord, CustomFieldValue, Matter, SourceRef, TimelineEvent } from "@/lib/types";
import { byType, daysBetween, dayKey, displayTitle, metaRef, normText, stripReplyPrefix, withoutNames } from "./util";

type Milestone = "incident" | "retained" | "suit" | "surgery" | "coverage" | "trial" | "ime" | "hearing";
/** Highest priority first; used when capping the story strip. */
const PRIORITY: Milestone[] = ["incident", "retained", "suit", "surgery", "coverage", "trial", "ime", "hearing"];
export const MAX_MILESTONES = 12;
export const COLLAPSE_DAYS = 14;

// Applied to the record's title (reply prefix and contact names removed): the event itself, not talk about it.
const TITLE_RULES: [Milestone, RegExp][] = [
  ["suit", /\b(suit|complaint|summons)\b.*\b(filed|commenced|served)\b|\b(filed|commenced)\b.*\b(suit|complaint)\b/],
  ["retained", /\b(retain\w*|retainer|initial consult\w*|intake consult\w*|signed up)\b/],
  ["surgery", /\b(surgery|surgical procedure|arthroscop\w*|\w+ectomy|\w+plasty|fusion|operation)\b/],
  ["ime", /\b(ime|independent medical exam\w*)\b/],
  ["trial", /\b(trial|mediation|arbitration)\b/],
  ["hearing", /\b(conference|hearing|deposition|ebt)\b/],
];
// Titles that are communications or admin *about* an event (a call, a letter, a notice, scheduling, a status recap).
const ABOUT_RE = /\b(call|calls|called|calling|phone|email|e-mail|letter|notice|chaser|follow[- ]?up|reminder|check[- ]?in|proposed|request\w*|status|update|ahead|prep|prepare|preparation|review|schedul\w*|reschedul\w*|availability|dates|re)\b/;
// Titles that are a pending/undecided status, not an event that happened.
const PENDING_RE = /\b(still|pending|undecided|unresolved|decision|decide|open question|no date|not yet|whether|awaiting|waiting)\b/;
// Titles stating the event took place (vs. authorised/requested/scheduled).
const PERFORMED_RE = /\b(performed|completed|done|held|attended|post-?op\w*)\b/;
const COVERAGE_RE = /\b(confirmed\b[^.]{0,60}\blimits?|limits?\b[^.]{0,40}\bconfirmed|coverage confirmed)\b/;
const ONCE: Milestone[] = ["incident", "retained", "suit", "coverage"];

const INCIDENT_FIELD = /(incident|accident|injury|loss|collision)/i;
export function incidentField(matter: Matter, records: ClioRecord[]): CustomFieldValue | null {
  const all = [...matter.customFields, ...byType(records, "custom_field")];
  return all.find((f) => f.fieldType === "date" && INCIDENT_FIELD.test(f.name) && dayKey(String(f.value ?? ""))) ?? null;
}

type Category = TimelineEvent["category"];
// Ordered: first match wins. Run on text with reply prefixes and contact names removed.
const CATEGORY_RULES: [Category, RegExp][] = [
  ["legal", /\b(court|conference|deposition|ebt|discovery|trial|motion|mediation|arbitration|hearing|suit|complaint|summons|pleadings?|subpoena|bill of particulars|interrogator\w*)\b/],
  ["money", /\b(employment|wages?|commissions?|ledgers?|bills?|billing|invoices?|liens?|specials|expenses?|payroll|earnings)\b/],
  ["treatment", /\b(surgery|surgical|therapy|treat\w*|mri|x-?rays?|pt|physical therapy|ortho\w*|chiro\w*|er|ime|medical|records|diagnos\w*|post-op|arthroscop\w*)\b/],
  ["insurance", /\b(coverage|limits?|adjuster|insur\w*|policy|carrier|no-fault|pip|um\/uim)\b/],
];
const ruleCategory = (text: string): Category | null => CATEGORY_RULES.find(([, re]) => re.test(text))?.[0] ?? null;

/** Timeline category of a record. Title decides; body is a fallback only when the title says nothing. */
export function timelineCategory(r: ClioRecord, names: string[]): Category {
  if (r.sourceType === "expense") return "money";
  return ruleCategory(withoutNames(stripReplyPrefix(displayTitle(r)), names))
    ?? ruleCategory(withoutNames(r.bodyText, names))
    ?? (r.sourceType === "communication" ? "communication" : "legal");
}

function milestoneKind(r: ClioRecord, names: string[]): Milestone | null {
  const title = withoutNames(stripReplyPrefix(displayTitle(r)), names);
  if (ABOUT_RE.test(title) || PENDING_RE.test(title)) return null;
  // Communications are never the event itself, except the one-time retention (often evidenced only by email).
  if (r.sourceType === "communication") return TITLE_RULES.find(([, re]) => re.test(title))?.[0] === "retained" ? "retained" : null;
  let kind = TITLE_RULES.find(([, re]) => re.test(title))?.[0] ?? null;
  if (!kind && r.sourceType === "note" && COVERAGE_RE.test(normText(`${r.title} ${r.bodyText}`))) kind = "coverage";
  if (r.sourceType === "document" && kind !== "suit") return null; // documents: only filed pleadings are milestones
  return kind;
}

function milestoneCategory(m: Milestone): Category {
  if (m === "incident") return "incident";
  if (m === "surgery" || m === "ime") return "treatment";
  if (m === "coverage") return "insurance";
  return "legal";
}

const eventId = (date: string, title: string, clioId: string) =>
  createHash("sha1").update(`${date}|${title}|${clioId}`).digest("hex");

type Ev = TimelineEvent & { kind: Milestone | null; thread: string | null; actual: boolean };

/** Same kind within COLLAPSE_DAYS of the window's first event -> one per window, preferring the event itself over
 *  authorisation/request notes (earliest on ties); one-time kinds once; then cap by kind priority. */
function selectMilestones(events: Ev[]): void {
  const windows = new Map<Milestone, { start: string; best: Ev }>();
  for (const e of events) {
    if (!e.kind) continue;
    const w = windows.get(e.kind);
    // Within the window of its first event, or of the event itself once that is found (never chains: best is then fixed).
    const near = w && (daysBetween(w.start, e.date) <= COLLAPSE_DAYS || (w.best.actual && daysBetween(w.best.date, e.date) <= COLLAPSE_DAYS));
    if (!w || (!ONCE.includes(e.kind) && !near)) {
      windows.set(e.kind, { start: e.date, best: e });
      continue;
    }
    const loser = e.actual && !w.best.actual ? w.best : e;
    loser.milestone = false;
    if (loser !== e) windows.set(e.kind, { start: w.start, best: e });
  }
  const kept = events.filter((e) => e.milestone)
    .sort((a, b) => PRIORITY.indexOf(a.kind!) - PRIORITY.indexOf(b.kind!) || b.date.localeCompare(a.date));
  for (const e of kept.slice(MAX_MILESTONES)) e.milestone = false;
}

export function buildTimeline(matter: Matter, records: ClioRecord[]): TimelineEvent[] {
  const names = byType(records, "contact").map((c) => c.name);
  const events: Ev[] = [];
  const push = (date: string, title: string, ref: SourceRef, category: Category, kind: Milestone | null, thread: string | null, actual = false) =>
    events.push({ id: eventId(date, title, ref.clioId), date, derivation: "clio-metadata", title,
      category, milestone: kind != null, refs: [ref], kind, thread, actual });

  const inc = incidentField(matter, records);
  if (inc) {
    const d = dayKey(String(inc.value))!;
    push(d, "Incident", metaRef(inc, d), "incident", "incident", null, true);
  }
  const dated: ClioRecord[] = [...byType(records, "calendar_entry"), ...byType(records, "note"),
    ...byType(records, "communication"), ...byType(records, "document")];
  for (const r of dated) {
    const d = dayKey(r.sourceType === "document" ? r.receivedAt ?? r.sourceDate : r.sourceDate);
    if (!d) continue;
    const kind = milestoneKind(r, names);
    const title = kind === "coverage" ? "Coverage confirmed" : displayTitle(r);
    const thread = r.sourceType === "communication" ? normText(stripReplyPrefix(r.title)) : null;
    push(d, title, metaRef(r, d), kind ? milestoneCategory(kind) : timelineCategory(r, names), kind, thread,
      r.sourceType === "calendar_entry" || PERFORMED_RE.test(normText(displayTitle(r))));
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || Number(b.milestone) - Number(a.milestone));
  // A reply belongs with its thread: every message takes the category of the thread's first message.
  const threadCat = new Map<string, Category>();
  for (const e of events) {
    if (!e.thread) continue;
    const c = threadCat.get(e.thread);
    if (c) e.category = c; else threadCat.set(e.thread, e.category);
  }
  selectMilestones(events);
  return events.map((e) => ({ id: e.id, date: e.date, derivation: e.derivation, title: e.title,
    category: e.category, milestone: e.milestone, refs: e.refs }));
}
