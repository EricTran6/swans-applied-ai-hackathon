// Raw Clio JSON -> normalized ClioRecord (src/lib/types.ts). Pure functions, no I/O.
import crypto from "node:crypto";
import type {
  CalendarEntry, ClioRecord, Communication, Contact, CustomFieldValue, Document, Expense, Matter, Note,
  Party, RecordBase, SourceType, Task,
} from "@/lib/types";
import type { Raw, RawBundle } from "./raw";

// ---------- text helpers ----------
const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", hellip: "…", bull: "•", middot: "·",
  copy: "©", reg: "®", trade: "™", sect: "§", para: "¶", deg: "°", frac12: "½",
};

export function htmlUnescape(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g, (m, ent: string) => {
    if (ent[0] === "#") {
      const code = ent[1] === "x" || ent[1] === "X" ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return NAMED[ent.toLowerCase()] ?? m;
  });
}

/** Rich-text (HTML) to plain text, then unescape entities. */
export function htmlToText(s: string | null | undefined): string {
  if (!s) return "";
  const t = s
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return htmlUnescape(t).replace(/\n{3,}/g, "\n\n").trim();
}

function joinText(...parts: (string | null | undefined)[]): string {
  return parts.map((p) => (p ?? "").trim()).filter(Boolean).join("\n");
}

function str(v: unknown): string | null {
  return v === null || v === undefined || v === "" ? null : String(v);
}

// ---------- hashing ----------
const HASH_OMIT = new Set(["contentHash", "clioUrl", "createdAt", "updatedAt", "etag", "pageCount", "textLayer"]);

function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o).sort()) {
      if (HASH_OMIT.has(k) || o[k] === undefined) continue;
      out[k] = canonical(o[k]);
    }
    return out;
  }
  return v;
}

/**
 * sha256 of canonical JSON of the record's projected content. Excludes timestamps (seed time in demo data),
 * etag, and fields filled later by the PDF step, so re-seeding or touching a record without changing it
 * does not produce a change event.
 */
export function contentHash(rec: Omit<ClioRecord, "contentHash"> | ClioRecord): string {
  return crypto.createHash("sha256").update(JSON.stringify(canonical(rec))).digest("hex");
}

function finish<T extends ClioRecord>(rec: Omit<T, "contentHash"> & { contentHash?: string }): T {
  const r = { ...rec, contentHash: "" } as T;
  r.contentHash = contentHash(r);
  return r;
}

function base(type: SourceType, raw: Raw, matterId: string, sourceDate: string | null, title: string, bodyText: string)
  : Omit<RecordBase, "contentHash"> {
  const clioId = String(raw.id);
  return {
    sourceType: type, clioId, matterId,
    createdAt: str(raw.created_at) ?? "", updatedAt: str(raw.updated_at) ?? str(raw.created_at) ?? "",
    sourceDate, title, bodyText, drawerKey: `${type}:${clioId}`, etag: str(raw.etag),
  };
}

function party(p: Raw | null | undefined, fallbackKind: Party["kind"] = "User"): Party | null {
  if (!p || p.name == null) return null;
  const t = String(p.type ?? "");
  const kind: Party["kind"] = t === "Person" || t === "Company" ? t : t === "User" ? "User" : fallbackKind;
  return { contactId: kind === "User" || p.id == null ? null : String(p.id), name: htmlUnescape(String(p.name)), kind };
}

function parties(list: Raw[] | null | undefined): Party[] {
  return (list ?? []).map((p) => party(p)).filter((p): p is Party => p !== null);
}

// ---------- custom fields ----------
function formatCustomValue(fieldType: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (fieldType === "currency" && typeof value === "number") {
    return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2, minimumFractionDigits: Number.isInteger(value) ? 0 : 2 });
  }
  if (typeof value === "object") return JSON.stringify(value);
  return htmlUnescape(String(value));
}

export function normalizeCustomField(raw: Raw, matter: Raw, matterId: string): CustomFieldValue {
  const fieldType = String(raw.field_type ?? "");
  const rawVal = raw.value;
  const value: CustomFieldValue["value"] =
    rawVal === undefined ? null
      : typeof rawVal === "string" ? htmlUnescape(rawVal)
        : typeof rawVal === "number" || typeof rawVal === "boolean" || rawVal === null ? rawVal
          : JSON.stringify(rawVal);
  const name = htmlUnescape(String(raw.field_name ?? ""));
  const display = formatCustomValue(fieldType, rawVal);
  const b = base("custom_field", { ...raw, created_at: matter.created_at, updated_at: matter.updated_at, etag: null },
    matterId, fieldType === "date" && typeof rawVal === "string" ? rawVal : null, name, display ? `${name}: ${display}` : name);
  return finish<CustomFieldValue>({
    ...b, sourceType: "custom_field", fieldId: String(raw.custom_field?.id ?? raw.id), name, fieldType, value, display,
  });
}

// ---------- matter ----------
export function normalizeMatter(raw: Raw, clioUrl?: string): Matter {
  const matterId = String(raw.id);
  const customFields = (raw.custom_field_values ?? []).map((cf: Raw) => normalizeCustomField(cf, raw, matterId));
  const description = htmlUnescape(raw.description);
  const displayNumber = String(raw.display_number ?? matterId);
  const sol = raw.statute_of_limitations
    ? { dueAt: str(raw.statute_of_limitations.due_at), status: str(raw.statute_of_limitations.status) } : null;
  const b = base("matter", raw, matterId, str(raw.open_date), `${displayNumber} ${description}`.trim(), description);
  return finish<Matter>({
    ...b, ...(clioUrl ? { clioUrl } : {}), sourceType: "matter", displayNumber, description,
    status: String(raw.status ?? ""), openDate: str(raw.open_date), closeDate: str(raw.close_date),
    practiceArea: str(raw.practice_area?.name), clioStage: str(raw.matter_stage?.name), sol,
    responsibleAttorney: party(raw.responsible_attorney, "User"),
    client: party(raw.client, "Person") ?? { contactId: str(raw.client_id), name: "", kind: "Person" },
    customFields,
  });
}

// ---------- contacts ----------
export function roleKindFor(role: string | null, isClient: boolean): Contact["roleKind"] {
  if (isClient) return "client";
  const r = (role ?? "").toLowerCase();
  if (!r) return "other";
  if (/provider|treating|hospital|radiology|surgical|therapy|chiro/.test(r)) return "provider";
  if (/adverse|defendant/.test(r)) return "adverse";
  if (/insur|adjuster|administrator/.test(r)) return "insurer";
  return "other";
}

export function normalizeContact(raw: Raw, matterId: string, role: string | null, isClient: boolean): Contact {
  const name = htmlUnescape(String(raw.name ?? [raw.first_name, raw.last_name].filter(Boolean).join(" ")));
  const kind: Contact["kind"] = raw.type === "Company" ? "Company" : "Person";
  const email = str(raw.primary_email_address) ?? str(raw.email_addresses?.[0]?.address);
  const phone = str(raw.primary_phone_number) ?? str(raw.phone_numbers?.[0]?.number);
  const avatarUrl = str(raw.image_url) ?? str(typeof raw.avatar === "string" ? raw.avatar : raw.avatar?.url);
  const b = base("contact", raw, matterId, null, role ? `${name} (${role})` : name, joinText(name, role));
  return finish<Contact>({
    ...b, sourceType: "contact", name, kind,
    firstName: str(raw.first_name), lastName: str(raw.last_name), initials: str(raw.initials),
    dateOfBirth: str(raw.date_of_birth), avatarUrl, email, phone, company: str(raw.company?.name),
    role, roleKind: roleKindFor(role, isClient), isClient,
  });
}

// ---------- notes / communications ----------
export function normalizeNote(raw: Raw, matterId: string): Note {
  const subject = htmlUnescape(raw.subject);
  const detail = raw.detail_text_type === "rich_text" ? htmlToText(raw.detail) : htmlUnescape(raw.detail);
  const date = str(raw.date);
  const b = base("note", raw, matterId, date, subject || detail.slice(0, 80), joinText(subject, detail));
  return finish<Note>({ ...b, sourceType: "note", subject, date, author: party(raw.creator, "User") });
}

function commKind(t: string): string {
  if (/email/i.test(t)) return "Email";
  if (/phone/i.test(t)) return "Phone";
  return t.replace(/Communication$/, "") || "Other";
}

export function normalizeCommunication(raw: Raw, matterId: string): Communication {
  const subject = htmlUnescape(raw.subject);
  const body = htmlToText(raw.body);
  const occurredAt = str(raw.received_at) ?? (raw.date ? (raw.time ? `${raw.date}T${raw.time}` : String(raw.date)) : null)
    ?? str(raw.created_at) ?? "";
  const b = base("communication", raw, matterId, occurredAt || null, subject || body.slice(0, 80), joinText(subject, body));
  return finish<Communication>({
    ...b, sourceType: "communication", kind: commKind(String(raw.type ?? "")), subject, occurredAt,
    senders: parties(raw.senders), receivers: parties(raw.receivers), user: party(raw.user, "User"),
  });
}

// ---------- tasks / calendar ----------
export function normalizeTask(raw: Raw, matterId: string): Task {
  const name = htmlUnescape(raw.name);
  const description = htmlToText(raw.description);
  const dueAt = str(raw.due_at);
  const b = base("task", raw, matterId, dueAt, name, joinText(name, description));
  return finish<Task>({
    ...b, sourceType: "task", name, description, status: String(raw.status ?? ""), priority: str(raw.priority),
    dueAt, completedAt: str(raw.completed_at), isSol: raw.statute_of_limitations === true,
    assignee: party(raw.assignee, "User"),
  });
}

export function normalizeCalendarEntry(raw: Raw, matterId: string): CalendarEntry {
  const summary = htmlUnescape(raw.summary);
  const description = htmlToText(raw.description);
  const location = str(htmlUnescape(raw.location));
  const startAt = str(raw.start_at) ?? "";
  const b = base("calendar_entry", raw, matterId, startAt || null, summary, joinText(summary, description, location));
  return finish<CalendarEntry>({
    ...b, sourceType: "calendar_entry", summary, description, location, startAt, endAt: str(raw.end_at),
    allDay: raw.all_day === true, attendees: parties(raw.attendees),
  });
}

// ---------- expenses ----------
const FILE_RE = /([A-Za-z0-9][\w.\-]*\.(?:pdf|docx?|xlsx?|jpe?g|png|tiff?))/i;
export function parseBillFilename(note: string): string | null {
  const m = FILE_RE.exec(note);
  return m ? m[1] : null;
}

const NAME_STOP = new Set(["the", "of", "and", "llc", "pllc", "pc", "p", "c", "inc", "corp", "co", "ltd", "lp", "llp",
  "md", "do", "dds", "dc", "pa", "group", "associates", "assoc"]);

export function nameTokens(s: string): string[] {
  return s.toLowerCase()
    .replace(/\.[a-z0-9]{2,4}$/, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !/^\d+$/.test(t))
    .map((t) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t));
}

/** Share of a contact's name tokens that appear in the text (0..1). */
export function nameOverlap(contactName: string, text: string): number {
  const nt = [...new Set(nameTokens(contactName).filter((t) => !NAME_STOP.has(t)))];
  if (nt.length === 0) return 0;
  const tt = new Set(nameTokens(text));
  return nt.filter((t) => tt.has(t)).length / nt.length;
}

/** Best provider contact whose name tokens overlap the text by >= 60%; null when none or tied. */
export function matchProvider(text: string, providers: Pick<Contact, "clioId" | "name">[]): string | null {
  let best: { id: string; score: number } | null = null;
  let tie = false;
  for (const p of providers) {
    const score = nameOverlap(p.name, text);
    if (score < 0.6) continue;
    if (!best || score > best.score) {
      best = { id: p.clioId, score };
      tie = false;
    } else if (score === best.score) tie = true;
  }
  return best && !tie ? best.id : null;
}

export function normalizeExpense(raw: Raw, matterId: string, providers: Pick<Contact, "clioId" | "name">[]): Expense {
  const note = htmlUnescape(raw.note);
  const total = raw.total;
  const nbt = raw.non_billable_total;
  const isBill = (total === null || total === undefined) && nbt !== null && nbt !== undefined;
  const kind: Expense["kind"] = isBill ? "provider_bill" : "firm";
  const amount = Number(isBill ? nbt : total ?? 0) || 0;
  const billFilename = isBill ? parseBillFilename(note) : null;
  const vendor = str(raw.vendor?.name) ?? "";
  const providerContactId = isBill ? (matchProvider(joinText(billFilename, vendor), providers)
    ?? matchProvider(joinText(note, vendor), providers)) : null;
  const date = str(raw.date) ?? "";
  const category = str(raw.expense_category?.name) ?? str(raw.activity_description?.name);
  const firstLine = note.split("\n")[0].trim();
  const b = base("expense", raw, matterId, date || null, firstLine || category || "Expense", note);
  return finish<Expense>({
    ...b, sourceType: "expense", kind, date, amount, category, description: note, billed: raw.billed === true,
    providerContactId, billFilename,
  });
}

// ---------- documents ----------
export function normalizeDocument(raw: Raw, matterId: string): Document {
  const v = raw.latest_document_version ?? {};
  const name = htmlUnescape(raw.name ?? raw.filename ?? "");
  const filename = String(raw.filename ?? v.filename ?? name);
  const folder = raw.parent && (raw.parent.type ?? "Folder") === "Folder" ? str(htmlUnescape(raw.parent.name)) : null;
  const receivedAt = str(raw.received_at) ?? str(v.received_at);
  const b = base("document", raw, matterId, receivedAt, name, joinText(name, folder));
  return finish<Document>({
    ...b, sourceType: "document", name, filename, contentType: str(raw.content_type ?? v.content_type),
    size: typeof (raw.size ?? v.size) === "number" ? (raw.size ?? v.size) : null, folder, receivedAt,
    latestVersionId: str(v.id), latestVersionUuid: str(v.uuid), pageCount: null, textLayer: null,
  });
}

// ---------- bundle ----------
export function normalizeBundle(bundle: RawBundle, opts: { matterUrl?: string } = {}): ClioRecord[] {
  const matter = normalizeMatter(bundle.matter, opts.matterUrl);
  const matterId = matter.clioId;
  const clientId = matter.client.contactId;

  const roles = new Map<string, string[]>();
  for (const r of [...bundle.relationships, ...bundle.clientRelationships]) {
    if (r.matter?.id != null && String(r.matter.id) !== matterId) continue;
    const cid = r.contact?.id != null ? String(r.contact.id) : null;
    const desc = htmlUnescape(r.description).trim();
    if (!cid || !desc) continue;
    const list = roles.get(cid) ?? [];
    if (!list.includes(desc)) list.push(desc);
    roles.set(cid, list);
  }
  const contacts: Contact[] = [];
  const seen = new Set<string>();
  for (const c of [bundle.clientContact, ...bundle.relatedContacts]) {
    if (!c || c.id == null || seen.has(String(c.id))) continue;
    seen.add(String(c.id));
    const isClient = String(c.id) === clientId;
    const role = roles.get(String(c.id))?.join("; ") ?? (isClient ? "Client" : null);
    contacts.push(normalizeContact(c, matterId, role, isClient));
  }
  const providers = contacts.filter((c) => c.roleKind === "provider");

  const notes = [...bundle.notes, ...bundle.clientNotes];
  const noteIds = new Set<string>();
  return [
    matter,
    ...matter.customFields,
    ...contacts,
    ...notes.filter((n) => !noteIds.has(String(n.id)) && noteIds.add(String(n.id))).map((n) => normalizeNote(n, matterId)),
    ...bundle.communications.map((c) => normalizeCommunication(c, matterId)),
    ...bundle.tasks.map((t) => normalizeTask(t, matterId)),
    ...bundle.calendarEntries.map((c) => normalizeCalendarEntry(c, matterId)),
    ...bundle.expenses.map((e) => normalizeExpense(e, matterId, providers)),
    ...bundle.documents.filter((d) => d.type !== "Folder" && d.deleted !== true).map((d) => normalizeDocument(d, matterId)),
  ];
}
