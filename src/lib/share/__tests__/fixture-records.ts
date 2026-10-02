// Test-only: normalizes the synthetic raw Clio fixtures (fixtures/clio/*.json, fake client
// "Jane Doe") into ClioRecord[] so share tests can run without the real T01 normalizer.
// Never imported by runtime code.
import type {
  CalendarEntry, ClioRecord, Communication, Contact, CustomFieldValue, Digest, Document,
  Expense, Matter, Note, Party, Task,
} from "@/lib/types";
import matterRaw from "../../../../fixtures/clio/matter.json";
import clientRaw from "../../../../fixtures/clio/client_contact.json";
import relatedRaw from "../../../../fixtures/clio/related_contacts.json";
import relationshipsRaw from "../../../../fixtures/clio/relationships.json";
import notesRaw from "../../../../fixtures/clio/notes.json";
import commsRaw from "../../../../fixtures/clio/communications.json";
import tasksRaw from "../../../../fixtures/clio/tasks.json";
import calendarRaw from "../../../../fixtures/clio/calendar_entries.json";
import expensesRaw from "../../../../fixtures/clio/expenses.json";
import documentsRaw from "../../../../fixtures/clio/documents.json";
import digestRaw from "../../../../fixtures/sample-digest.json";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = Record<string, any>;

const MATTER_ID = String((matterRaw as Raw).id);
const SEED = "2026-10-02T10:00:00-07:00";

function base<T extends ClioRecord["sourceType"]>(sourceType: T, clioId: string, title: string, bodyText: string, sourceDate: string | null) {
  return {
    sourceType, clioId, matterId: MATTER_ID, createdAt: SEED, updatedAt: SEED, sourceDate, title, bodyText,
    drawerKey: `${sourceType}:${clioId}`, etag: null, contentHash: `hash-${sourceType}-${clioId}`,
  };
}
function party(p: Raw | null | undefined): Party | null {
  if (!p) return null;
  const kind = p.type === "User" ? "User" : p.type === "Company" ? "Company" : "Person";
  return { contactId: kind === "User" ? null : String(p.id), name: String(p.name), kind };
}
function unescape(s: string | null | undefined): string {
  return String(s ?? "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
function dateOnly(s: string | null | undefined): string | null { return s ? String(s).slice(0, 10) : null; }

function roleKind(desc: string): Contact["roleKind"] {
  const d = desc.toLowerCase();
  if (/treating|provider|physician|therap|chiro/.test(d)) return "provider";
  if (/adverse|defendant|driver/.test(d)) return "adverse";
  if (/insur|adjuster|administrator|carrier/.test(d)) return "insurer";
  return "other";
}

export function fixtureRecords(): ClioRecord[] {
  const m = matterRaw as Raw;
  const customFields: CustomFieldValue[] = (m.custom_field_values as Raw[]).map((cf) => ({
    ...base("custom_field", String(cf.id), String(cf.field_name), String(cf.value ?? ""), null),
    fieldId: String(cf.custom_field?.id ?? cf.id), name: String(cf.field_name), fieldType: String(cf.field_type),
    value: cf.value as CustomFieldValue["value"], display: String(cf.value ?? ""),
  }));
  const matter: Matter = {
    ...base("matter", MATTER_ID, String(m.display_number), String(m.description), dateOnly(m.open_date)),
    displayNumber: String(m.display_number), description: String(m.description), status: String(m.status),
    openDate: dateOnly(m.open_date), closeDate: dateOnly(m.close_date), practiceArea: m.practice_area?.name ?? null,
    clioStage: m.matter_stage?.name ?? null,
    sol: m.statute_of_limitations ? { dueAt: dateOnly(m.statute_of_limitations.due_at), status: m.statute_of_limitations.status ?? null } : null,
    responsibleAttorney: m.responsible_attorney ? { contactId: null, name: String(m.responsible_attorney.name), kind: "User" } : null,
    client: party(m.client)!, customFields,
  };

  const roles = new Map<string, string>();
  for (const r of relationshipsRaw as Raw[]) roles.set(String(r.contact.id), String(r.description));
  const contacts: Contact[] = [clientRaw as Raw, ...(relatedRaw as Raw[])].map((c) => {
    const role = c.is_client ? "Client" : roles.get(String(c.id)) ?? null;
    return {
      ...base("contact", String(c.id), String(c.name), "", null),
      name: String(c.name), kind: c.type === "Company" ? "Company" : "Person",
      firstName: c.first_name ?? null, lastName: c.last_name ?? null, initials: c.initials ?? null,
      dateOfBirth: c.date_of_birth ?? null, avatarUrl: null, email: c.primary_email_address ?? null,
      phone: c.primary_phone_number ?? null, company: c.company ?? null, role,
      roleKind: c.is_client ? "client" : roleKind(role ?? ""), isClient: Boolean(c.is_client),
    };
  });

  const notes: Note[] = (notesRaw as Raw[]).map((n) => ({
    ...base("note", String(n.id), String(n.subject), unescape(n.detail), dateOnly(n.date)),
    subject: String(n.subject), date: dateOnly(n.date), author: null,
  }));
  const comms: Communication[] = (commsRaw as Raw[]).map((c) => ({
    ...base("communication", String(c.id), String(c.subject), unescape(c.body), dateOnly(c.date)),
    kind: c.type === "PhoneCommunication" ? "Phone" : "Email", subject: String(c.subject), occurredAt: String(c.date),
    senders: (c.senders as Raw[]).map(party).filter((p): p is Party => !!p),
    receivers: (c.receivers as Raw[]).map(party).filter((p): p is Party => !!p),
    user: c.user ? { contactId: null, name: String(c.user.name), kind: "User" } : null,
  }));
  const tasks: Task[] = (tasksRaw as Raw[]).map((t) => ({
    ...base("task", String(t.id), String(t.name), String(t.description ?? ""), dateOnly(t.due_at)),
    name: String(t.name), description: String(t.description ?? ""), status: String(t.status), priority: t.priority ?? null,
    dueAt: dateOnly(t.due_at), completedAt: t.completed_at ?? null, isSol: Boolean(t.statute_of_limitations), assignee: party(t.assignee),
  }));
  const calendar: CalendarEntry[] = (calendarRaw as Raw[]).map((e) => ({
    ...base("calendar_entry", String(e.id), String(e.summary), String(e.description ?? ""), dateOnly(e.start_at)),
    summary: String(e.summary), description: String(e.description ?? ""), location: e.location ?? null,
    startAt: String(e.start_at), endAt: e.end_at ?? null, allDay: Boolean(e.all_day),
    attendees: ((e.attendees ?? []) as Raw[]).map(party).filter((p): p is Party => !!p),
  }));
  const providerByName = new Map(contacts.filter((c) => c.roleKind === "provider").map((c) => [c.name.toLowerCase(), c.clioId]));
  const expenses: Expense[] = (expensesRaw as Raw[]).map((x) => {
    const isBill = x.total == null && x.non_billable_total != null;
    const note = String(x.note ?? "");
    const file = /Bill:\s*(\S+\.pdf)/i.exec(note)?.[1] ?? null;
    let providerContactId: string | null = null;
    if (isBill && file) {
      for (const [name, id] of providerByName) {
        if (file.toLowerCase().includes(name.split(" ")[0].toLowerCase())) providerContactId = id;
      }
    }
    return {
      ...base("expense", String(x.id), isBill ? "Medical bill" : note, note, dateOnly(x.date)),
      kind: isBill ? "provider_bill" : "firm", date: String(x.date), amount: Number(isBill ? x.non_billable_total : x.total),
      category: x.expense_category?.name ?? null, description: note, billed: Boolean(x.billed), providerContactId, billFilename: file,
    };
  });
  const documents: Document[] = (documentsRaw as Raw[]).map((d) => ({
    ...base("document", String(d.id), String(d.name), "", dateOnly(d.received_at)),
    name: String(d.name), filename: String(d.filename ?? d.name), contentType: d.content_type ?? null, size: d.size ?? null,
    folder: d.parent?.name ?? null, receivedAt: dateOnly(d.received_at),
    latestVersionId: d.latest_document_version ? String(d.latest_document_version.id) : null,
    latestVersionUuid: d.latest_document_version?.uuid ?? null, pageCount: 4, textLayer: true,
  }));

  return [matter, ...customFields, ...contacts, ...notes, ...comms, ...tasks, ...calendar, ...expenses, ...documents];
}

export function fixtureDigest(): Digest { return digestRaw as unknown as Digest; }
export const FIXTURE_NOW = new Date("2026-10-02T12:00:00Z");
export function fixtureProviders(records: ClioRecord[]): Contact[] {
  return records.filter((r): r is Contact => r.sourceType === "contact" && r.roleKind === "provider");
}
