// Sync one matter into our DB (owner T01): diff by content hash, write item events,
// download + extract PDFs per document version. Reads Clio via GET only; writes only to our SQLite.
import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import type { ChangeEntry, ClioRecord, Document, DocumentText } from "@/lib/types";
import { getDb } from "@/lib/db";
import { downloadDocument, fetchMatterRecords } from "@/lib/clio";
import { extractPdfText, hasTextLayer } from "@/lib/pdf";

interface IngestConfig {
  db: Database.Database | null;
  docsDir: string | null;
  now: () => string;
}
const config: IngestConfig = { db: null, docsDir: null, now: () => new Date().toISOString() };

/** Override the DB, docs dir or clock (tests, scripts). Pass null to restore defaults. */
export function configureIngest(opts: Partial<IngestConfig>): void {
  Object.assign(config, opts);
}

function db(): Database.Database {
  return config.db ?? getDb();
}

export function docsDir(): string {
  return config.docsDir ?? path.resolve(process.cwd(), "data", "docs");
}

function safePart(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]/g, "_");
}

function versionKey(doc: Document): string {
  return doc.latestVersionUuid ?? (doc.latestVersionId ? `v${doc.latestVersionId}` : "unversioned");
}

function isPdf(doc: Document): boolean {
  return doc.contentType === "application/pdf" || /\.pdf$/i.test(doc.filename || doc.name);
}

interface ItemRow { source_type: string; clio_id: string; content_hash: string; deleted_at: string | null; record_json: string }

function toChange(row: { kind: ChangeEntry["kind"]; rec: Pick<ClioRecord, "sourceType" | "clioId" | "title" | "sourceDate" | "drawerKey"> }, at: string): ChangeEntry {
  return { kind: row.kind, sourceType: row.rec.sourceType, clioId: row.rec.clioId, title: row.rec.title,
    sourceDate: row.rec.sourceDate, detectedAt: at, drawerKey: row.rec.drawerKey };
}

/** Upsert records and write item events by content hash. Pure DB step (exported for tests/scripts). */
export function applyRecords(matterId: string, records: ClioRecord[]): ChangeEntry[] {
  const d = db();
  const now = config.now();
  const existing = d.prepare("SELECT source_type, clio_id, content_hash, deleted_at, record_json FROM items WHERE matter_id = ?")
    .all(matterId) as ItemRow[];
  const byKey = new Map(existing.map((r) => [`${r.source_type}:${r.clio_id}`, r]));
  const insert = d.prepare(`INSERT INTO items (matter_id, source_type, clio_id, etag, content_hash, record_json, first_seen_at, last_seen_at, deleted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
    ON CONFLICT (source_type, clio_id) DO UPDATE SET matter_id = excluded.matter_id, etag = excluded.etag,
      content_hash = excluded.content_hash, record_json = excluded.record_json, last_seen_at = excluded.last_seen_at, deleted_at = NULL`);
  const touch = d.prepare("UPDATE items SET last_seen_at = ?, etag = ?, record_json = ? WHERE source_type = ? AND clio_id = ?");
  const markDeleted = d.prepare("UPDATE items SET deleted_at = ? WHERE source_type = ? AND clio_id = ?");
  const event = d.prepare(`INSERT INTO item_events (matter_id, source_type, clio_id, kind, content_hash, prev_hash, title, source_date, detected_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const events: ChangeEntry[] = [];

  d.transaction(() => {
    const seen = new Set<string>();
    for (const rec of records) {
      const key = `${rec.sourceType}:${rec.clioId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const prev = byKey.get(key);
      const json = JSON.stringify(rec);
      if (prev && !prev.deleted_at && prev.content_hash === rec.contentHash) {
        // Preserve fields filled by the PDF step when the content is unchanged.
        touch.run(now, rec.etag, mergeDocFields(prev.record_json, rec), rec.sourceType, rec.clioId);
        continue;
      }
      const kind: ChangeEntry["kind"] = prev && !prev.deleted_at ? "changed" : "new";
      insert.run(matterId, rec.sourceType, rec.clioId, rec.etag, rec.contentHash, json, now, now);
      event.run(matterId, rec.sourceType, rec.clioId, kind, rec.contentHash, prev?.content_hash ?? null, rec.title, rec.sourceDate, now);
      events.push(toChange({ kind, rec }, now));
    }
    for (const row of existing) {
      if (row.deleted_at || seen.has(`${row.source_type}:${row.clio_id}`)) continue;
      const rec = JSON.parse(row.record_json) as ClioRecord;
      markDeleted.run(now, row.source_type, row.clio_id);
      event.run(matterId, row.source_type, row.clio_id, "deleted", null, row.content_hash, rec.title, rec.sourceDate, now);
      events.push(toChange({ kind: "deleted", rec }, now));
    }
  })();
  return events;
}

function mergeDocFields(prevJson: string, rec: ClioRecord): string {
  if (rec.sourceType !== "document") return JSON.stringify(rec);
  const prev = JSON.parse(prevJson) as Document;
  return JSON.stringify({ ...rec, pageCount: rec.pageCount ?? prev.pageCount, textLayer: rec.textLayer ?? prev.textLayer });
}

/** Ensure the PDF for the document's current version is cached on disk; returns its path. */
export async function ensureDocumentFile(doc: Document): Promise<string> {
  const dir = docsDir();
  const file = path.join(dir, `${safePart(doc.clioId)}-${safePart(versionKey(doc))}.pdf`);
  if (fs.existsSync(file)) return file;
  const bytes = await downloadDocument(doc);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${file}.part`;
  fs.writeFileSync(tmp, bytes);
  fs.renameSync(tmp, file);
  return file;
}

function readText(clioId: string, version: string): (DocumentText & { filePath: string }) | null {
  const row = db().prepare("SELECT clio_id, version_uuid, page_count, pages_json, file_path FROM document_texts WHERE clio_id = ? AND version_uuid = ?")
    .get(clioId, version) as { clio_id: string; version_uuid: string; page_count: number; pages_json: string; file_path: string } | undefined;
  if (!row) return null;
  return { clioId: row.clio_id, versionUuid: row.version_uuid, pageCount: row.page_count,
    pages: JSON.parse(row.pages_json) as string[], filePath: row.file_path };
}

/** Text for each PDF document at its current version: from DB cache, else download + extract. */
async function syncDocumentTexts(docs: Document[], log: (m: string) => void): Promise<DocumentText[]> {
  const out: DocumentText[] = [];
  const upsert = db().prepare(`INSERT INTO document_texts (clio_id, version_uuid, page_count, pages_json, file_path, created_at)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (clio_id, version_uuid) DO UPDATE SET page_count = excluded.page_count,
    pages_json = excluded.pages_json, file_path = excluded.file_path`);
  for (const doc of docs.filter(isPdf)) {
    const version = versionKey(doc);
    let text: DocumentText | null = readText(doc.clioId, version);
    if (!text) {
      try {
        const file = await ensureDocumentFile(doc);
        const { pageCount, pages } = await extractPdfText(fs.readFileSync(file));
        upsert.run(doc.clioId, version, pageCount, JSON.stringify(pages), file, config.now());
        text = { clioId: doc.clioId, versionUuid: version, pageCount, pages };
      } catch (e) {
        log(`document ${doc.clioId}: ${(e as Error).message}`);
        continue;
      }
    } else {
      text = { clioId: text.clioId, versionUuid: text.versionUuid, pageCount: text.pageCount, pages: text.pages };
    }
    doc.pageCount = text.pageCount;
    doc.textLayer = hasTextLayer(text.pages);
    out.push(text);
  }
  return out;
}

export async function syncMatter(matterId: string): Promise<{ records: ClioRecord[]; events: ChangeEntry[]; documentTexts: DocumentText[] }> {
  const records = await fetchMatterRecords(matterId);
  const mid = records.find((r) => r.sourceType === "matter")?.clioId ?? String(matterId);
  const docs = records.filter((r): r is Document => r.sourceType === "document");
  const documentTexts = await syncDocumentTexts(docs, (m) => console.warn(`[ingest] ${m}`));
  const events = applyRecords(mid, records);
  return { records, events, documentTexts };
}

export function loadRecords(matterId: string): ClioRecord[] {
  const rows = db().prepare("SELECT record_json FROM items WHERE matter_id = ? AND deleted_at IS NULL ORDER BY source_type, clio_id")
    .all(matterId) as { record_json: string }[];
  return rows.map((r) => JSON.parse(r.record_json) as ClioRecord);
}

function currentText(clioId: string): (DocumentText & { filePath: string }) | null {
  const item = db().prepare("SELECT record_json FROM items WHERE source_type = 'document' AND clio_id = ? AND deleted_at IS NULL")
    .get(clioId) as { record_json: string } | undefined;
  if (item) {
    const t = readText(clioId, versionKey(JSON.parse(item.record_json) as Document));
    if (t) return t;
  }
  const row = db().prepare("SELECT version_uuid FROM document_texts WHERE clio_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(clioId) as { version_uuid: string } | undefined;
  return row ? readText(clioId, row.version_uuid) : null;
}

export function getDocumentText(clioId: string): DocumentText | null {
  const t = currentText(clioId);
  if (!t) return null;
  return { clioId: t.clioId, versionUuid: t.versionUuid, pageCount: t.pageCount, pages: t.pages };
}

export function getDocumentFilePath(clioId: string): string | null {
  const t = currentText(clioId);
  if (t && fs.existsSync(t.filePath)) return t.filePath;
  return null;
}
