// Raw Clio payloads for one matter, from HTTP (GET only) or from a fixture dir
// (CLIO_FIXTURE_DIR, same filenames as scripts/clio_dump.py writes to .cache/clio).
import fs from "node:fs";
import path from "node:path";
import { clioGet } from "./http";
import * as F from "./fields";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Raw = Record<string, any>;

export interface RawBundle {
  matter: Raw;
  clientContact: Raw | null;
  relationships: Raw[];
  clientRelationships: Raw[];
  relatedContacts: Raw[];
  notes: Raw[];
  clientNotes: Raw[];
  communications: Raw[];
  tasks: Raw[];
  calendarEntries: Raw[];
  expenses: Raw[];
  documents: Raw[];
  folders: Raw[];
}

export function fixtureDir(): string | null {
  const d = process.env.CLIO_FIXTURE_DIR;
  return d ? path.resolve(d) : null;
}

function readFixture<T>(dir: string, name: string, fallback: T): T {
  const p = path.join(dir, `${name}.json`);
  if (!fs.existsSync(p)) return fallback;
  return JSON.parse(fs.readFileSync(p, "utf8")) as T;
}

export function loadFixtureBundle(dir: string): RawBundle {
  const matter = readFixture<Raw | null>(dir, "matter", null);
  if (!matter) throw new Error(`fixture dir ${dir} has no matter.json`);
  return {
    matter,
    clientContact: readFixture<Raw | null>(dir, "client_contact", null),
    relationships: readFixture<Raw[]>(dir, "relationships", []),
    clientRelationships: readFixture<Raw[]>(dir, "client_relationships", []),
    relatedContacts: readFixture<Raw[]>(dir, "related_contacts", []),
    notes: readFixture<Raw[]>(dir, "notes", []),
    clientNotes: readFixture<Raw[]>(dir, "client_notes", []),
    communications: readFixture<Raw[]>(dir, "communications", []),
    tasks: readFixture<Raw[]>(dir, "tasks", []),
    calendarEntries: readFixture<Raw[]>(dir, "calendar_entries", []),
    expenses: readFixture<Raw[]>(dir, "expenses", []),
    documents: readFixture<Raw[]>(dir, "documents", []),
    folders: readFixture<Raw[]>(dir, "folders", []),
  };
}

function assertId(id: string): string {
  if (!/^\d+$/.test(id)) throw new Error("invalid Clio id");
  return id;
}

export async function fetchRawBundle(matterId: string): Promise<RawBundle> {
  const dir = fixtureDir();
  if (dir) return loadFixtureBundle(dir);
  const mid = assertId(String(matterId));
  const [matter] = await clioGet<Raw>(`matters/${mid}.json`, { fields: F.f(F.MATTER_F) });
  if (!matter) throw new Error(`matter ${mid} not found`);
  const clientId = matter.client?.id != null ? assertId(String(matter.client.id)) : null;

  const [relationships, clientRelationships, notes, clientNotes, communications, tasks,
    calendarEntries, expenses, documents, folders, clientContact] = await Promise.all([
    clioGet<Raw>("relationships.json", { matter_id: mid, fields: F.f(F.REL_F) }),
    clientId ? clioGet<Raw>("relationships.json", { contact_id: clientId, fields: F.f(F.REL_F) }) : Promise.resolve([]),
    clioGet<Raw>("notes.json", { type: "Matter", matter_id: mid, fields: F.f(F.NOTE_F) }),
    clientId ? clioGet<Raw>("notes.json", { type: "Contact", contact_id: clientId, fields: F.f(F.NOTE_F) }) : Promise.resolve([]),
    clioGet<Raw>("communications.json", { matter_id: mid, fields: F.f(F.COMM_F) }),
    clioGet<Raw>("tasks.json", { matter_id: mid, fields: F.f(F.TASK_F) }),
    clioGet<Raw>("calendar_entries.json", { matter_id: mid, from: "2000-01-01T00:00:00Z", to: "2040-01-01T00:00:00Z", fields: F.f(F.CAL_F) }),
    clioGet<Raw>("activities.json", { matter_id: mid, type: "ExpenseEntry", fields: F.f(F.EXP_F) }),
    clioGet<Raw>("documents.json", { matter_id: mid, fields: F.f(F.DOC_F) }),
    clioGet<Raw>("folders.json", { matter_id: mid, fields: F.f(F.FOLDER_F) }),
    clientId ? clioGet<Raw>(`contacts/${clientId}.json`, { fields: F.f(F.CONTACT_F) }).then((r) => r[0] ?? null) : Promise.resolve(null),
  ]);

  // Client relationships are only kept when they point at this matter.
  const crels = clientRelationships.filter((r) => r.matter?.id == null || String(r.matter.id) === mid);
  const ids = new Set<string>();
  for (const r of [...relationships, ...crels]) {
    if (r.contact?.id != null && String(r.contact.id) !== clientId) ids.add(String(r.contact.id));
  }
  const relatedContacts: Raw[] = [];
  for (const cid of [...ids].sort()) {
    const [c] = await clioGet<Raw>(`contacts/${assertId(cid)}.json`, { fields: F.f(F.CONTACT_F) });
    if (c) relatedContacts.push(c);
  }
  return { matter, clientContact, relationships, clientRelationships: crels, relatedContacts, notes, clientNotes,
    communications, tasks, calendarEntries, expenses, documents, folders };
}

export async function fetchOpenMattersRaw(): Promise<Raw[]> {
  const dir = fixtureDir();
  if (dir) return [readFixture<Raw>(dir, "matter", {})].filter((m) => m.id != null);
  return clioGet<Raw>("matters.json", { status: "open", fields: F.f(F.MATTER_LIST_F) });
}
