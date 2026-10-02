// Candidate builder: classifies every digest fact and Clio record into a ShareCategory for one
// recipient provider. Fail closed: anything unclassifiable is hard-denied, anything scoped to a
// different provider is excluded, and AI/keyword flags can only lower inclusion (see flags.ts).
import type {
  CalendarEntry, ClioRecord, Contact, CustomFieldValue, Digest, Document, Expense, Injury, Matter, Note,
  Communication, ShareCandidate, ShareCategory, SharePreset, Task, TimelineEvent,
} from "@/lib/types";
import { providerFor, providers, roleLabel } from "./scope";
import { humanizeFilename, templateNeed, templateUpdate } from "./templates";

export const DEFAULT_PRESET: SharePreset = {
  allow: ["status", "stage", "coverage", "appointments", "requests", "own_records", "own_bill", "updates"],
  optIn: ["other_records", "care_team"],
};
export const HARD_DENY = ["valuation", "settlement", "attorney_notes", "internal_comms"] as const;
export const ALL_CATEGORIES: readonly ShareCategory[] = [
  "status", "stage", "coverage", "appointments", "requests", "own_records", "own_bill", "other_records", "updates",
  "care_team", "valuation", "settlement", "attorney_notes", "liability", "firm_expenses", "other_liens", "client_pii",
  "internal_comms",
];
/** Synthetic ids the share builder (T10) toggles. */
export const ID_STATUS = "status:alive";
export const ID_STAGE = "status:stage";
export const ID_COVERAGE = "kpi:coverage";
export const ID_COVERAGE_LIMITS = "coverage:limits";
export const ID_OWN_BILL = "bill:own";

export type Payload =
  | { kind: "task"; task: Task }
  | { kind: "calendar"; entry: CalendarEntry }
  | { kind: "document"; doc: Document; providerName: string | null; isBill: boolean }
  | { kind: "bill"; amount: number; servicesThrough: string | null; billDate: string | null }
  | { kind: "update"; date: string; text: string }
  | { kind: "careteam"; name: string; role: string }
  | { kind: "finding"; text: string; source: string }
  | { kind: "none" };

export interface ShareItem extends ShareCandidate { payload: Payload }

export interface ShareContext {
  matter: Matter | null;
  client: Contact | null;
  providers: Contact[];
  recipient: Contact | null;
  hipaaOnFile: boolean;
  limitsConfirmed: boolean;
}

export function isHardDeny(category: ShareCategory): boolean {
  return (HARD_DENY as readonly string[]).includes(category);
}
export function isKnownCategory(c: string): c is ShareCategory {
  return (ALL_CATEGORIES as readonly string[]).includes(c);
}

const dateOnly = (s: string | null | undefined): string | null => (s ? s.slice(0, 10) : null);

function customFieldCategory(name: string): ShareCategory {
  const n = name.toLowerCase();
  if (/value|rationale|specials|settle|offer|demand/.test(n)) return "valuation";
  if (/lien|medicaid|medicare|health insurance|erisa/.test(n)) return "other_liens";
  if (/wage|income|employ|prior|ssn|social|birth|dob|address|phone|email|incident/.test(n)) return "client_pii";
  if (/liabilit|fault|negligen/.test(n)) return "liability";
  if (/claim number|claim no|policy number|adjuster/.test(n)) return "internal_comms";
  if (/summary|strategy|assessment|notes?$/.test(n)) return "attorney_notes";
  if (/limits? confirmed|coverage confirmed/.test(n)) return "coverage";
  if (/policy limits|coverage|carrier/.test(n)) return "coverage";
  if (/treatment status|treating/.test(n)) return "status";
  return "internal_comms";
}

function documentFolderKind(doc: Document): "bill" | "record" | "pii" | "liability" | "unknown" {
  const f = `${doc.folder ?? ""} ${doc.filename}`.toLowerCase();
  if (/\bbills?\b|invoice|ledger/.test(f)) return "bill";
  if (/medical.?records?|treatment|records/.test(f)) return "record";
  if (/intake|retainer|hipaa|photo|\bid\b|license|wage|pay.?stub|tax/.test(f)) return "pii";
  if (/plead|discover|expert|\bime\b|court|correspond|letter|demand|settle|evaluation/.test(f)) return "liability";
  return "unknown";
}

export function buildContext(records: ClioRecord[], recipientContactId: string | null): ShareContext {
  const matter = records.find((r): r is Matter => r.sourceType === "matter") ?? null;
  const contacts = records.filter((r): r is Contact => r.sourceType === "contact");
  const client = contacts.find((c) => c.isClient) ?? null;
  const provs = providers(records);
  const recipient = recipientContactId ? provs.find((p) => p.clioId === recipientContactId) ?? null : null;
  const cfs: CustomFieldValue[] = [
    ...records.filter((r): r is CustomFieldValue => r.sourceType === "custom_field"),
    ...(matter?.customFields ?? []),
  ];
  const truthy = (cf: CustomFieldValue) => cf.value === true || /^(true|yes|1)$/i.test(String(cf.value ?? ""));
  const hipaaOnFile = cfs.some((cf) => /hipaa/i.test(cf.name) && truthy(cf));
  const limitsConfirmed = cfs.some((cf) => /limits? confirmed|coverage confirmed/i.test(cf.name) && truthy(cf));
  return { matter, client, providers: provs, recipient, hipaaOnFile, limitsConfirmed };
}

function mk(id: string, category: ShareCategory, label: string, preview: string, providerContactId: string | null,
  payload: Payload, extra: Partial<Pick<ShareItem, "hardDeny">> = {}): ShareItem {
  return { id, category, label, preview, included: false, hardDeny: isHardDeny(category) || !!extra.hardDeny,
    providerContactId, flag: null, payload };
}

/** Every classifiable item for this recipient, before preset/inclusion is applied. */
export function buildItems(d: Digest, records: ClioRecord[], recipientContactId: string | null, ctx = buildContext(records, recipientContactId)): ShareItem[] {
  const items: ShareItem[] = [];
  const rid = recipientContactId;
  const provs = ctx.providers;
  const provName = (id: string | null) => provs.find((p) => p.clioId === id)?.name ?? null;

  // --- digest-level facts ---
  items.push(mk(ID_STATUS, "status", "Case status", "Active / stalled, last firm activity date, next event date", null, { kind: "none" }));
  items.push(mk(ID_STAGE, "stage", "Case stage", "Coarse stage label (treating, pre-suit, in litigation, settled, closed)", null, { kind: "none" }));
  items.push(mk(ID_COVERAGE, "coverage", "Coverage confirmed", "Whether liability coverage is confirmed, and the date", null, { kind: "none" }));
  items.push(mk(ID_COVERAGE_LIMITS, "coverage", "Coverage limits", "Liability policy limits (dollar figures); off by default", null, { kind: "none" }));
  for (const k of d.kpis) {
    if (k.key === "case_value" || k.key === "specials") items.push(mk(`kpi:${k.key}`, "valuation", k.label, "Case valuation: never shared", null, { kind: "none" }));
    else if (k.key === "firm_spend") items.push(mk(`kpi:${k.key}`, "firm_expenses", k.label, "Firm expenses", null, { kind: "none" }));
  }
  if (d.valueWaterfall.length) items.push(mk("digest:waterfall", "valuation", "Value waterfall", "Case valuation: never shared", null, { kind: "none" }));
  if (d.brief.length) items.push(mk("digest:brief", "attorney_notes", "Case brief", "Attorney summary: never shared", null, { kind: "none" }));
  if (d.openQuestions.length) items.push(mk("digest:openQuestions", "attorney_notes", "Open questions", "Attorney work product: never shared", null, { kind: "none" }));
  if (d.topTen.length) items.push(mk("digest:topTen", "attorney_notes", "Top items", "Attorney work product: never shared", null, { kind: "none" }));

  // --- bills: digest.providerBills first, expense rows as fallback ---
  const billExpenses = records.filter((r): r is Expense => r.sourceType === "expense" && r.kind === "provider_bill");
  const seenBillProviders = new Set<string>();
  const pushBill = (pid: string | null, amount: number, servicesThrough: string | null, billDate: string | null) => {
    const key = pid ?? "unmatched";
    if (seenBillProviders.has(key)) return;
    seenBillProviders.add(key);
    if (pid && pid === rid) {
      items.push(mk(ID_OWN_BILL, "own_bill", "Your bill on file", `Bill on file${servicesThrough ? ` for services through ${servicesThrough}` : ""}`, pid,
        { kind: "bill", amount, servicesThrough, billDate }));
    } else {
      items.push(mk(`bill:${key}`, "other_liens", `Bill: ${provName(pid) ?? "unmatched provider"}`, "Another provider's bill: never shared", pid,
        { kind: "none" }, { hardDeny: true }));
    }
  };
  for (const b of d.providerBills) pushBill(b.providerContactId, b.amount, dateOnly(b.servicesThrough), dateOnly(b.refs[0]?.sourceDate ?? null));
  for (const e of billExpenses) {
    const through = /through\s+(\d{4}-\d{2}-\d{2})/i.exec(e.description)?.[1] ?? null;
    pushBill(e.providerContactId, e.amount, through, dateOnly(e.date));
  }

  // --- records ---
  for (const r of records) {
    switch (r.sourceType) {
      case "note": {
        const n = r as Note;
        items.push(mk(`note:${n.clioId}`, "attorney_notes", `Note: ${n.subject || "untitled"}`, "Notes are never shared with providers", null, { kind: "none" }));
        break;
      }
      case "communication": {
        const c = r as Communication;
        const pid = providerFor(`${c.subject}`, provs, [...c.senders, ...c.receivers]);
        if (pid) {
          const outbound = c.receivers.some((p) => p.contactId === pid);
          const text = outbound ? "Request sent to your office" : "Correspondence received from your office";
          items.push(mk(`communication:${c.clioId}`, "updates", `${outbound ? "To" : "From"} ${provName(pid)}: ${dateOnly(c.occurredAt)}`, text, pid,
            { kind: "update", date: dateOnly(c.occurredAt) ?? "", text }));
        } else {
          items.push(mk(`communication:${c.clioId}`, "internal_comms", `Communication: ${c.subject || c.kind}`, "Client, insurer and internal communications are never shared", null, { kind: "none" }));
        }
        break;
      }
      case "task": {
        const t = r as Task;
        const open = t.status !== "complete" && !t.completedAt;
        const pid = providerFor(`${t.name}`, provs, t.assignee ? [t.assignee] : []);
        if (t.isSol || !pid) {
          items.push(mk(`task:${t.clioId}`, "internal_comms", `Task: ${t.name}`, "Internal task: never shared", null, { kind: "none" }));
        } else if (!open) {
          items.push(mk(`task:${t.clioId}`, "requests", `Completed request: ${t.name}`, "Completed request (not shown)", pid, { kind: "none" }, { hardDeny: true }));
        } else {
          const text = templateNeed(t.name, t.description);
          items.push(mk(`task:${t.clioId}`, "requests", `Request: ${provName(pid)}`, `${text}${t.dueAt ? ` (due ${dateOnly(t.dueAt)})` : ""}`, pid, { kind: "task", task: t }));
        }
        break;
      }
      case "calendar_entry": {
        const e = r as CalendarEntry;
        const pid = providerFor(e.summary, provs, e.attendees);
        const treatment = /treatment|therap|chiro|visit|appointment|follow.?up|consult|surg|pre.?op|post.?op|evaluation/i.test(e.summary);
        if (pid && treatment) {
          items.push(mk(`calendar_entry:${e.clioId}`, "appointments", `Appointment: ${provName(pid)} ${dateOnly(e.startAt)}`, `Client treatment on ${dateOnly(e.startAt)}`, pid, { kind: "calendar", entry: e }));
        } else {
          items.push(mk(`calendar_entry:${e.clioId}`, "internal_comms", `Calendar: ${e.summary}`, "Court and internal calendar entries are never shared verbatim", null, { kind: "none" }));
        }
        break;
      }
      case "document": {
        const doc = r as Document;
        const kind = documentFolderKind(doc);
        const pid = kind === "bill" || kind === "record" ? providerFor(doc.filename, provs) : null;
        const human = humanizeFilename(doc.filename);
        if (kind === "bill") {
          if (pid && pid === rid) items.push(mk(`document:${doc.clioId}`, "own_bill", `Your bill: ${human}`, "Your itemized bill (name and date only)", pid, { kind: "document", doc, providerName: provName(pid), isBill: true }));
          else items.push(mk(`document:${doc.clioId}`, "other_liens", `Bill: ${human}`, "Another provider's bill: never shared", pid, { kind: "none" }, { hardDeny: true }));
        } else if (kind === "record") {
          const own = !!pid && pid === rid;
          items.push(mk(`document:${doc.clioId}`, own ? "own_records" : "other_records", `${own ? "Your records" : "Records"}: ${human}`,
            own ? "Your records (name and date only)" : `Another provider's records (${provName(pid) ?? "unmatched"}): opt-in`, pid,
            { kind: "document", doc, providerName: provName(pid), isBill: false }));
        } else if (kind === "pii") {
          items.push(mk(`document:${doc.clioId}`, "client_pii", `Document: ${human}`, "Client identity / intake document", null, { kind: "none" }));
        } else if (kind === "liability") {
          items.push(mk(`document:${doc.clioId}`, "liability", `Document: ${human}`, "Pleadings, discovery and expert material", null, { kind: "none" }));
        } else {
          items.push(mk(`document:${doc.clioId}`, "internal_comms", `Document: ${human}`, "Unclassified document: never shared", null, { kind: "none" }));
        }
        break;
      }
      case "expense": {
        const e = r as Expense;
        if (e.kind === "firm") items.push(mk(`expense:${e.clioId}`, "firm_expenses", "Firm expense", "Firm case expense", null, { kind: "none" }));
        break; // provider_bill rows handled above
      }
      case "custom_field": {
        const cf = r as CustomFieldValue;
        if (/hipaa/i.test(cf.name)) break; // gate, not a candidate
        const cat = customFieldCategory(cf.name);
        if (cat === "status" || cat === "coverage") break; // already represented by status:alive / kpi:coverage
        items.push(mk(`custom_field:${cf.clioId}`, cat, `Field: ${cf.name}`, "Matter field (withheld)", null, { kind: "none" }));
        break;
      }
      case "contact": {
        const c = r as Contact;
        if (c.isClient) items.push(mk(`contact:${c.clioId}`, "client_pii", "Client identity and contact details", "Only first name and last initial are ever shown", null, { kind: "none" }));
        else if (c.roleKind === "provider" && c.clioId !== rid) items.push(mk(`careteam:${c.clioId}`, "care_team", `Care team: ${c.name}`, `${c.name} (${roleLabel(c)})`, c.clioId, { kind: "careteam", name: c.name, role: roleLabel(c) }));
        break;
      }
      default:
        break;
    }
  }

  // --- updates from structured milestone events (legal / insurance only; never note text) ---
  for (const ev of d.timeline as TimelineEvent[]) {
    if (!(ev.category === "legal" || ev.category === "insurance")) continue;
    const text = templateUpdate(ev.title, ev.category);
    if (!text) continue;
    items.push(mk(`update:${ev.id}`, "updates", `Update: ${text}`, `${ev.date}: ${text}`, null, { kind: "update", date: dateOnly(ev.date) ?? "", text }));
  }

  // --- findings from injuries (document page refs only, never expert/IME documents) ---
  const docsById = new Map(records.filter((r): r is Document => r.sourceType === "document").map((x) => [x.clioId, x]));
  (d.injuries as Injury[]).forEach((inj, i) => {
    const ref = inj.refs.find((x) => x.sourceType === "document" && x.page);
    if (!ref) return;
    const doc = docsById.get(ref.clioId);
    if (!doc || /expert|\bime\b|independent medical/i.test(`${doc.folder ?? ""} ${doc.filename}`)) return;
    const status = inj.status === "surgery-done" ? (inj.firstDocumented ? `, surgery ${inj.firstDocumented}` : ", surgery done")
      : inj.status === "surgery-recommended" ? ", surgery recommended, date pending" : "";
    const text = `${inj.name}${status}`;
    const source = `${humanizeFilename(doc.filename)} p${ref.page}`;
    items.push(mk(`finding:${i}`, "care_team", `Finding: ${inj.name}`, `${text} (${source})`, null, { kind: "finding", text, source }));
  });

  return items;
}

/** Scope rule: an item about another provider may only ever enter via opt-in `other_records`. */
export function inScope(item: Pick<ShareCandidate, "category" | "providerContactId">, recipientContactId: string | null): boolean {
  if (item.providerContactId == null) return true;
  if (recipientContactId == null) return false; // no recipient: nothing provider-scoped, not even opt-ins
  if (item.providerContactId === recipientContactId) return true;
  return item.category === "other_records" || item.category === "care_team";
}

export function defaultIncluded(item: ShareItem, recipientContactId: string | null, preset: SharePreset): boolean {
  if (item.hardDeny || !isKnownCategory(item.category)) return false;
  if (!inScope(item, recipientContactId)) return false;
  if (item.id === ID_COVERAGE_LIMITS) return false; // visible toggle, default off
  if (item.category === "other_records" || item.category === "care_team") return false; // opt-in per item
  if (preset.optIn.includes(item.category)) return false;
  return preset.allow.includes(item.category);
}

export function buildCandidates(d: Digest, records: ClioRecord[], recipientContactId: string | null, preset: SharePreset): ShareCandidate[] {
  const ctx = buildContext(records, recipientContactId);
  return buildItems(d, records, recipientContactId, ctx).map((item) => {
    const { payload: _payload, ...cand } = item;
    void _payload;
    return { ...cand, included: defaultIncluded(item, recipientContactId, preset) };
  });
}
