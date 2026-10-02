// Dated case timeline with generic PI milestone rules.
import { createHash } from "node:crypto";
import type { ClioRecord, CustomFieldValue, Matter, SourceRef, TimelineEvent } from "@/lib/types";
import { byType, dayKey, metaRef, normText } from "./util";

type Milestone = "incident" | "retained" | "surgery" | "suit" | "coverage" | "ime" | "hearing";
// Applied to the record's title; the coverage rule also reads the body (it needs "confirmed" + "limits").
const TITLE_RULES: [Milestone, RegExp][] = [
  ["suit", /\b(suit|complaint|summons)\b.*\b(filed|commenced|served)\b|\b(filed|commenced)\b.*\b(suit|complaint)\b/],
  ["retained", /\b(retain\w*|retainer|initial consult\w*|intake consult\w*|signed up)\b/],
  ["surgery", /\b(surgery|surgical procedure|arthroscop\w*|\w+ectomy|\w+plasty|fusion|operation)\b/],
  ["ime", /\b(ime|independent medical exam\w*)\b/],
  ["hearing", /\b(trial|conference|mediation|arbitration|hearing)\b/],
];
const COVERAGE_RE = /\b(confirmed\b[^.]{0,60}\blimits?|limits?\b[^.]{0,40}\bconfirmed|coverage confirmed)\b/;
const ONCE: Milestone[] = ["incident", "retained", "suit", "coverage"];

const INCIDENT_FIELD = /(incident|accident|injury|loss|collision)/i;
export function incidentField(matter: Matter, records: ClioRecord[]): CustomFieldValue | null {
  const all = [...matter.customFields, ...byType(records, "custom_field")];
  return all.find((f) => f.fieldType === "date" && INCIDENT_FIELD.test(f.name) && dayKey(String(f.value ?? ""))) ?? null;
}

function category(r: ClioRecord, m: Milestone | null): TimelineEvent["category"] {
  if (m === "incident") return "incident";
  if (m === "surgery" || m === "ime") return "treatment";
  if (m === "coverage") return "insurance";
  if (m === "suit" || m === "hearing" || m === "retained") return "legal";
  if (r.sourceType === "expense") return "money";
  const t = normText(`${r.title} ${r.bodyText}`);
  if (/\b(coverage|limits?|adjuster|insur\w*|policy)\b/.test(t)) return "insurance";
  if (/\b(lien|bill|ledger|specials)\b/.test(t)) return "money";
  if (/\b(treat\w*|therapy|pt|surgery|er|mri|ortho\w*|medical|chiro\w*)\b/.test(t)) return "treatment";
  if (r.sourceType === "communication") return "communication";
  return "legal";
}

const eventId = (date: string, title: string, clioId: string) =>
  createHash("sha1").update(`${date}|${title}|${clioId}`).digest("hex");

export function buildTimeline(matter: Matter, records: ClioRecord[]): TimelineEvent[] {
  const events: (TimelineEvent & { kind: Milestone | null })[] = [];
  const push = (date: string, title: string, ref: SourceRef, r: ClioRecord, kind: Milestone | null) =>
    events.push({ id: eventId(date, title, ref.clioId), date, derivation: "clio-metadata", title,
      category: category(r, kind), milestone: kind != null, refs: [ref], kind });

  const inc = incidentField(matter, records);
  if (inc) {
    const d = dayKey(String(inc.value))!;
    push(d, "Incident", metaRef(inc, d), inc, "incident");
  }
  const dated: ClioRecord[] = [...byType(records, "calendar_entry"), ...byType(records, "note"),
    ...byType(records, "communication"), ...byType(records, "document")];
  for (const r of dated) {
    const d = dayKey(r.sourceType === "document" ? r.receivedAt ?? r.sourceDate : r.sourceDate);
    if (!d) continue;
    const title = normText(r.title);
    let kind: Milestone | null = TITLE_RULES.find(([, re]) => re.test(title))?.[0] ?? null;
    if (!kind && COVERAGE_RE.test(normText(`${r.title} ${r.bodyText}`))) kind = "coverage";
    if (r.sourceType === "document" && kind !== "suit") kind = null; // documents: only filed pleadings are milestones
    push(d, kind === "coverage" ? "Coverage confirmed" : r.title, metaRef(r, d), r, kind);
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || Number(b.milestone) - Number(a.milestone));
  // One-time milestones mark only their first occurrence; repeatable ones once per date.
  const seen = new Set<string>();
  for (const e of events) {
    if (!e.kind) continue;
    const k = ONCE.includes(e.kind) ? e.kind : `${e.kind}|${e.date}`;
    if (seen.has(k)) e.milestone = false;
    seen.add(k);
  }
  return events.map((e) => ({ id: e.id, date: e.date, derivation: e.derivation, title: e.title,
    category: e.category, milestone: e.milestone, refs: e.refs }));
}
