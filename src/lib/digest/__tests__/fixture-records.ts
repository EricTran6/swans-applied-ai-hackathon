// Test-only normalizer: raw Clio fixture JSON -> ClioRecord[] (mirrors the T01 contract shapes).
// Never imported by runtime code.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type {
  CalendarEntry, ClioRecord, Communication, Contact, CustomFieldValue, Document, Expense,
  ExtractedFacts, Matter, Note, Party, SourceRef, Task,
} from "@/lib/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
const DIR = path.resolve(__dirname, "../../../../fixtures/clio");
const load = (f: string): any => JSON.parse(readFileSync(path.join(DIR, f), "utf8"));
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const unescape = (s: string) => s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">");

function base<S extends ClioRecord["sourceType"]>(sourceType: S, raw: any, matterId: string, extra: {
  sourceDate: string | null; title: string; bodyText: string }) {
  const clioId = String(raw.id);
  return {
    sourceType, clioId, matterId, createdAt: raw.created_at ?? "", updatedAt: raw.updated_at ?? "",
    sourceDate: extra.sourceDate, title: extra.title, bodyText: extra.bodyText,
    drawerKey: `${sourceType}:${clioId}`, etag: raw.etag ?? null, contentHash: hash(raw),
  };
}
const party = (p: any): Party => ({
  contactId: p.type === "User" ? null : String(p.id), name: p.name,
  kind: p.type === "User" ? "User" : p.type === "Company" ? "Company" : "Person",
});
const roleKind = (d: string): Contact["roleKind"] =>
  /provider|physician|therap|chiro|ortho|hospital|medical/i.test(d) ? "provider"
    : /adverse|defendant/i.test(d) ? "adverse" : /insur|adjuster|administrator/i.test(d) ? "insurer" : "other";

export function fixtureRecords(): { matter: Matter; records: ClioRecord[] } {
  const m = load("matter.json");
  const matterId = String(m.id);
  const customFields: CustomFieldValue[] = m.custom_field_values.map((c: any) => ({
    ...base("custom_field", c, matterId, { sourceDate: null, title: c.field_name, bodyText: String(c.value ?? "") }),
    fieldId: String(c.custom_field.id), name: c.field_name, fieldType: c.field_type, value: c.value,
    display: String(c.value ?? ""),
  }));
  const matter: Matter = {
    ...base("matter", m, matterId, { sourceDate: m.open_date, title: m.display_number, bodyText: m.description }),
    clioUrl: `https://app.clio.example/matters/${matterId}`,
    displayNumber: m.display_number, description: m.description, status: m.status, openDate: m.open_date,
    closeDate: m.close_date, practiceArea: m.practice_area?.name ?? null, clioStage: m.matter_stage?.name ?? null,
    sol: m.statute_of_limitations ? { dueAt: m.statute_of_limitations.due_at, status: m.statute_of_limitations.status } : null,
    responsibleAttorney: { contactId: null, name: m.responsible_attorney.name, kind: "User" },
    client: { contactId: String(m.client.id), name: m.client.name, kind: "Person" }, customFields,
  };
  const cc = load("client_contact.json");
  const contact = (c: any, role: string | null, isClient: boolean): Contact => ({
    ...base("contact", c, matterId, { sourceDate: null, title: c.name, bodyText: role ?? "" }),
    name: c.name, kind: c.type, firstName: c.first_name, lastName: c.last_name, initials: c.initials,
    dateOfBirth: c.date_of_birth, avatarUrl: null, email: c.primary_email_address, phone: c.primary_phone_number,
    company: null, role, roleKind: isClient ? "client" : roleKind(role ?? ""), isClient,
  });
  const rels: any[] = load("relationships.json");
  const contacts: Contact[] = [contact(cc, "Client", true), ...load("related_contacts.json").map((c: any) =>
    contact(c, rels.find((r) => r.contact.id === c.id)?.description ?? null, false))];

  const notes: Note[] = load("notes.json").map((n: any) => ({
    ...base("note", n, matterId, { sourceDate: n.date, title: n.subject, bodyText: unescape(n.detail) }),
    subject: n.subject, date: n.date, author: null,
  }));
  const comms: Communication[] = load("communications.json").map((c: any) => ({
    ...base("communication", c, matterId, { sourceDate: c.date, title: c.subject, bodyText: unescape(c.body) }),
    kind: String(c.type).replace(/Communication$/, ""), subject: c.subject, occurredAt: c.date,
    senders: c.senders.map(party), receivers: c.receivers.map(party), user: { contactId: null, name: c.user.name, kind: "User" },
  }));
  const tasks: Task[] = load("tasks.json").map((t: any) => ({
    ...base("task", t, matterId, { sourceDate: t.due_at, title: t.name, bodyText: t.description ?? "" }),
    name: t.name, description: t.description ?? "", status: t.status, priority: t.priority, dueAt: t.due_at,
    completedAt: t.completed_at, isSol: !!t.statute_of_limitations, assignee: party(t.assignee),
  }));
  const cal: CalendarEntry[] = load("calendar_entries.json").map((e: any) => ({
    ...base("calendar_entry", e, matterId, { sourceDate: e.start_at, title: e.summary, bodyText: e.description ?? "" }),
    summary: e.summary, description: e.description ?? "", location: e.location, startAt: e.start_at,
    endAt: e.end_at, allDay: e.all_day, attendees: [],
  }));
  const providers = contacts.filter((c) => c.roleKind === "provider");
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const expenses: Expense[] = load("expenses.json").map((x: any) => {
    const isFirm = x.total != null;
    const file = /Bill:\s*(\S+\.pdf)/i.exec(x.note ?? "")?.[1] ?? null;
    const prov = file ? providers.find((p) => slug(p.name).split("-").filter((t) => !/^(pllc|llc|inc|pc)$/.test(t))
      .every((t) => slug(file).includes(t))) : undefined;
    return {
      ...base("expense", x, matterId, { sourceDate: x.date, title: (x.note ?? "").split(".")[0], bodyText: x.note ?? "" }),
      kind: isFirm ? "firm" : "provider_bill", date: x.date, amount: isFirm ? x.total : x.non_billable_total,
      category: null, description: x.note ?? "", billed: x.billed,
      providerContactId: isFirm ? null : prov?.clioId ?? null, billFilename: isFirm ? null : file,
    } as Expense;
  });
  const docs: Document[] = load("documents.json").map((d: any) => ({
    ...base("document", d, matterId, { sourceDate: d.received_at, title: d.name, bodyText: "" }),
    name: d.name, filename: d.filename, contentType: d.content_type, size: d.size, folder: d.parent?.name ?? null,
    receivedAt: d.received_at, latestVersionId: String(d.latest_document_version.id),
    latestVersionUuid: d.latest_document_version.uuid, pageCount: 3, textLayer: true,
  }));
  return { matter, records: [matter, ...customFields, ...contacts, ...notes, ...comms, ...tasks, ...cal, ...expenses, ...docs] };
}

/** What the AI extraction step would return for the fixture case (validated refs). */
export function fixtureFacts(records: ClioRecord[]): ExtractedFacts {
  const ref = (key: string, value: string, quote: string | null): SourceRef => {
    const r = records.find((x) => x.drawerKey === key)!;
    return { value, sourceType: r.sourceType, clioId: r.clioId, sourceDate: r.sourceDate, quote, drawerKey: key,
      derivation: quote ? "stated" : "clio-metadata", quoteVerified: !!quote };
  };
  const cov = ref("note:100026", "$250,000/$500,000", "liability limits $250,000/$500,000");
  const pl = ref("custom_field:text_area-30006", "UM/UIM $50,000/$100,000", "client UM/UIM $50,000/$100,000");
  return {
    caseValue: null,
    coverage: [
      { kind: "BI", perPerson: 250000, perAccident: 500000, carrier: null, refs: [cov] },
      { kind: "UM/UIM", perPerson: 50000, perAccident: 100000, carrier: null, refs: [pl] },
      { kind: "No-fault/PIP", perPerson: 50000, perAccident: null, carrier: null, refs: [pl] },
    ],
    coverageConfirmed: { confirmed: true, on: "2026-09-05", ref: cov },
    liens: [{ holder: "State Medicaid", amount: 9400, ref: ref("note:100022", "$9,400", "lien of $9,400") }],
    conflicts: [{ field: "coverage", refs: [ref("note:100016", "self-insured", "Acme Delivery Corp is self-insured")] }],
  };
}
