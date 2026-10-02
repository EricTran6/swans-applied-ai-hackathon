// Typed repos over the SQLite schema. Raw SQL, no ORM. Never touches Clio.
import type Database from "better-sqlite3";
import type {
  AiCall, ChangeEntry, ClioRecord, Digest, DocumentText, ExtractionCache, ExtractionKey,
  ShareResponse, SourceType,
} from "@/lib/types";

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? null : String(v));

export interface ItemRow {
  matterId: string; sourceType: SourceType; clioId: string; etag: string | null; contentHash: string;
  record: ClioRecord; firstSeenAt: string; lastSeenAt: string; deletedAt: string | null;
}
export interface ShareRow {
  id: string; matterId: string; tokenHash: string; recipientLabel: string; recipientContactId: string | null;
  presetJson: string; includedIdsJson: string; payloadJson: string; attorneyNote: string | null;
  sharedCount: number; withheldCount: number; digestVersion: number;
  createdAt: string; expiresAt: string; revokedAt: string | null;
}
export interface SyncRunRow { id: number; matterId: string; state: string; startedAt: string; finishedAt: string | null; message: string | null }
export interface ViewStateRow { viewerId: string; matterId: string; lastOpenedAt: string; lastDigestVersion: number | null }
export interface OauthTokenRow { accessToken: string; refreshToken: string | null; expiresAt: string | null; updatedAt: string }

const toItem = (r: Row): ItemRow => ({
  matterId: String(r.matter_id), sourceType: r.source_type as SourceType, clioId: String(r.clio_id),
  etag: s(r.etag), contentHash: String(r.content_hash), record: JSON.parse(String(r.record_json)) as ClioRecord,
  firstSeenAt: String(r.first_seen_at), lastSeenAt: String(r.last_seen_at), deletedAt: s(r.deleted_at),
});
const toShare = (r: Row): ShareRow => ({
  id: String(r.id), matterId: String(r.matter_id), tokenHash: String(r.token_hash),
  recipientLabel: String(r.recipient_label), recipientContactId: s(r.recipient_contact_id),
  presetJson: String(r.preset_json), includedIdsJson: String(r.included_ids_json), payloadJson: String(r.payload_json),
  attorneyNote: s(r.attorney_note), sharedCount: Number(r.shared_count), withheldCount: Number(r.withheld_count),
  digestVersion: Number(r.digest_version), createdAt: String(r.created_at), expiresAt: String(r.expires_at),
  revokedAt: s(r.revoked_at),
});
const toRun = (r: Row): SyncRunRow => ({
  id: Number(r.id), matterId: String(r.matter_id), state: String(r.state), startedAt: String(r.started_at),
  finishedAt: s(r.finished_at), message: s(r.message),
});
const toResponse = (r: Row): ShareResponse => ({
  id: String(r.id), shareId: String(r.share_id), needId: s(r.need_id), kind: r.kind as ShareResponse["kind"],
  promisedDate: s(r.promised_date), text: s(r.text), createdAt: String(r.created_at),
});

export function createRepos(db: Database.Database) {
  const items = {
    get(sourceType: SourceType, clioId: string): ItemRow | null {
      const r = db.prepare("SELECT * FROM items WHERE source_type=? AND clio_id=?").get(sourceType, clioId) as Row | undefined;
      return r ? toItem(r) : null;
    },
    /** Insert or update the current state of a record; keeps first_seen_at, clears deleted_at. */
    upsert(record: ClioRecord, now: string): void {
      db.prepare(
        `INSERT INTO items (matter_id, source_type, clio_id, etag, content_hash, record_json, first_seen_at, last_seen_at, deleted_at)
         VALUES (@matter_id, @source_type, @clio_id, @etag, @content_hash, @record_json, @now, @now, NULL)
         ON CONFLICT (source_type, clio_id) DO UPDATE SET
           matter_id=excluded.matter_id, etag=excluded.etag, content_hash=excluded.content_hash,
           record_json=excluded.record_json, last_seen_at=excluded.last_seen_at, deleted_at=NULL`,
      ).run({
        matter_id: record.matterId, source_type: record.sourceType, clio_id: record.clioId, etag: record.etag,
        content_hash: record.contentHash, record_json: JSON.stringify(record), now,
      });
    },
    markDeleted(sourceType: SourceType, clioId: string, at: string): void {
      db.prepare("UPDATE items SET deleted_at=? WHERE source_type=? AND clio_id=?").run(at, sourceType, clioId);
    },
    listByMatter(matterId: string, includeDeleted = false): ItemRow[] {
      const sql = `SELECT * FROM items WHERE matter_id=?${includeDeleted ? "" : " AND deleted_at IS NULL"} ORDER BY source_type, clio_id`;
      return (db.prepare(sql).all(matterId) as Row[]).map(toItem);
    },
    records(matterId: string): ClioRecord[] { return items.listByMatter(matterId).map((i) => i.record); },
    hasMatter(matterId: string): boolean {
      return !!db.prepare("SELECT 1 FROM items WHERE matter_id=? AND deleted_at IS NULL LIMIT 1").get(matterId);
    },
  };

  const events = {
    insert(e: { matterId: string; sourceType: SourceType; clioId: string; kind: ChangeEntry["kind"];
      contentHash: string | null; prevHash: string | null; title: string; sourceDate: string | null; detectedAt: string }): void {
      db.prepare(
        `INSERT INTO item_events (matter_id, source_type, clio_id, kind, content_hash, prev_hash, title, source_date, detected_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      ).run(e.matterId, e.sourceType, e.clioId, e.kind, e.contentHash, e.prevHash, e.title, e.sourceDate, e.detectedAt);
    },
    /** Events detected strictly after `afterIso`, newest first. */
    listAfter(matterId: string, afterIso: string, limit = 200): ChangeEntry[] {
      const rows = db.prepare(
        "SELECT * FROM item_events WHERE matter_id=? AND detected_at>? ORDER BY detected_at DESC, id DESC LIMIT ?",
      ).all(matterId, afterIso, limit) as Row[];
      return rows.map((r) => ({
        kind: r.kind as ChangeEntry["kind"], sourceType: r.source_type as SourceType, clioId: String(r.clio_id),
        title: String(r.title), sourceDate: s(r.source_date), detectedAt: String(r.detected_at),
        drawerKey: `${r.source_type}:${r.clio_id}`,
      }));
    },
  };

  const documentTexts = {
    upsert(t: DocumentText & { filePath: string }, now: string): void {
      db.prepare(
        `INSERT INTO document_texts (clio_id, version_uuid, page_count, pages_json, file_path, created_at)
         VALUES (?,?,?,?,?,?)
         ON CONFLICT (clio_id, version_uuid) DO UPDATE SET page_count=excluded.page_count,
           pages_json=excluded.pages_json, file_path=excluded.file_path`,
      ).run(t.clioId, t.versionUuid ?? "", t.pageCount, JSON.stringify(t.pages), t.filePath, now);
    },
    /** Most recently stored version for a document. */
    latest(clioId: string): (DocumentText & { filePath: string }) | null {
      const r = db.prepare("SELECT * FROM document_texts WHERE clio_id=? ORDER BY created_at DESC, rowid DESC LIMIT 1").get(clioId) as Row | undefined;
      if (!r) return null;
      return {
        clioId: String(r.clio_id), versionUuid: String(r.version_uuid) || null, pageCount: Number(r.page_count),
        pages: JSON.parse(String(r.pages_json)) as string[], filePath: String(r.file_path),
      };
    },
  };

  const extractions = {
    get(k: ExtractionKey): unknown | null {
      const r = db.prepare(
        "SELECT facts_json FROM extractions WHERE source_type=? AND clio_id=? AND content_hash=? AND extractor_version=?",
      ).get(k.sourceType, k.clioId, k.contentHash, k.extractorVersion) as Row | undefined;
      return r ? JSON.parse(String(r.facts_json)) : null;
    },
    set(k: ExtractionKey, v: unknown): void {
      db.prepare(
        `INSERT OR REPLACE INTO extractions (source_type, clio_id, content_hash, extractor_version, facts_json, created_at)
         VALUES (?,?,?,?,?,?)`,
      ).run(k.sourceType, k.clioId, k.contentHash, k.extractorVersion, JSON.stringify(v), new Date().toISOString());
    },
    asCache(): ExtractionCache { return { get: extractions.get, set: extractions.set }; },
  };

  const digests = {
    latest(matterId: string): Digest | null {
      const r = db.prepare("SELECT digest_json FROM digests WHERE matter_id=? ORDER BY version DESC LIMIT 1").get(matterId) as Row | undefined;
      return r ? (JSON.parse(String(r.digest_json)) as Digest) : null;
    },
    /** Assigns version = max+1 atomically and returns the stored digest. */
    insert(d: Omit<Digest, "version">, synthVersion: string, costUsd: number): Digest {
      return db.transaction(() => {
        const m = db.prepare("SELECT COALESCE(MAX(version),0) AS v FROM digests WHERE matter_id=?").get(d.matterId) as { v: number };
        const full = { ...d, version: m.v + 1 } as Digest;
        db.prepare(
          `INSERT INTO digests (matter_id, version, input_set_hash, synth_version, digest_json, cost_usd, created_at)
           VALUES (?,?,?,?,?,?,?)`,
        ).run(full.matterId, full.version, full.inputSetHash, synthVersion, JSON.stringify(full), costUsd, full.createdAt);
        return full;
      })();
    },
    totalCostUsd(matterId: string): number {
      const r = db.prepare("SELECT COALESCE(SUM(cost_usd),0) AS c FROM digests WHERE matter_id=?").get(matterId) as { c: number };
      return r.c;
    },
  };

  const syncRuns = {
    start(matterId: string, state: string, now: string): number {
      return Number(db.prepare("INSERT INTO sync_runs (matter_id, state, started_at) VALUES (?,?,?)").run(matterId, state, now).lastInsertRowid);
    },
    update(id: number, state: string, message: string | null, finishedAt: string | null): void {
      db.prepare("UPDATE sync_runs SET state=?, message=?, finished_at=? WHERE id=?").run(state, message, finishedAt, id);
    },
    latest(matterId: string): SyncRunRow | null {
      const r = db.prepare("SELECT * FROM sync_runs WHERE matter_id=? ORDER BY id DESC LIMIT 1").get(matterId) as Row | undefined;
      return r ? toRun(r) : null;
    },
    lastCompleted(matterId: string): SyncRunRow | null {
      const r = db.prepare("SELECT * FROM sync_runs WHERE matter_id=? AND state='idle' ORDER BY id DESC LIMIT 1").get(matterId) as Row | undefined;
      return r ? toRun(r) : null;
    },
  };

  const shares = {
    insert(r: ShareRow): void {
      db.prepare(
        `INSERT INTO shares (id, matter_id, token_hash, recipient_label, recipient_contact_id, preset_json, included_ids_json,
           payload_json, attorney_note, shared_count, withheld_count, digest_version, created_at, expires_at, revoked_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)`,
      ).run(r.id, r.matterId, r.tokenHash, r.recipientLabel, r.recipientContactId, r.presetJson, r.includedIdsJson,
        r.payloadJson, r.attorneyNote, r.sharedCount, r.withheldCount, r.digestVersion, r.createdAt, r.expiresAt);
    },
    get(id: string): ShareRow | null {
      const r = db.prepare("SELECT * FROM shares WHERE id=?").get(id) as Row | undefined;
      return r ? toShare(r) : null;
    },
    getByTokenHash(tokenHash: string): ShareRow | null {
      const r = db.prepare("SELECT * FROM shares WHERE token_hash=?").get(tokenHash) as Row | undefined;
      return r ? toShare(r) : null;
    },
    listByMatter(matterId: string): ShareRow[] {
      return (db.prepare("SELECT * FROM shares WHERE matter_id=? ORDER BY created_at DESC, rowid DESC").all(matterId) as Row[]).map(toShare);
    },
    revoke(id: string, at: string): boolean {
      return db.prepare("UPDATE shares SET revoked_at=? WHERE id=? AND revoked_at IS NULL").run(at, id).changes > 0;
    },
  };

  const shareViews = {
    insert(shareId: string, viewedAt: string, ipHash: string | null, userAgent: string | null): void {
      db.prepare("INSERT INTO share_views (share_id, viewed_at, ip_hash, user_agent) VALUES (?,?,?,?)").run(shareId, viewedAt, ipHash, userAgent);
    },
    /** True when this share already has a view from the same ip hash (NULL matches NULL) at or after `sinceIso`. */
    seenSince(shareId: string, ipHash: string | null, sinceIso: string): boolean {
      return !!db.prepare("SELECT 1 FROM share_views WHERE share_id=? AND ip_hash IS ? AND viewed_at>=? LIMIT 1").get(shareId, ipHash, sinceIso);
    },
    stats(shareId: string): { views: number; firstViewedAt: string | null; lastViewedAt: string | null } {
      const r = db.prepare("SELECT COUNT(*) AS n, MIN(viewed_at) AS f, MAX(viewed_at) AS l FROM share_views WHERE share_id=?").get(shareId) as Row;
      return { views: Number(r.n), firstViewedAt: s(r.f), lastViewedAt: s(r.l) };
    },
  };

  const shareResponses = {
    insert(r: ShareResponse): void {
      db.prepare("INSERT INTO share_responses (id, share_id, need_id, kind, promised_date, text, created_at) VALUES (?,?,?,?,?,?,?)")
        .run(r.id, r.shareId, r.needId, r.kind, r.promisedDate, r.text, r.createdAt);
    },
    countByShare(shareId: string): number {
      return Number((db.prepare("SELECT COUNT(*) AS n FROM share_responses WHERE share_id=?").get(shareId) as Row).n);
    },
    listByShare(shareId: string): ShareResponse[] {
      return (db.prepare("SELECT * FROM share_responses WHERE share_id=? ORDER BY created_at, rowid").all(shareId) as Row[]).map(toResponse);
    },
  };

  const viewState = {
    get(viewerId: string, matterId: string): ViewStateRow | null {
      const r = db.prepare("SELECT * FROM view_state WHERE viewer_id=? AND matter_id=?").get(viewerId, matterId) as Row | undefined;
      return r ? { viewerId, matterId, lastOpenedAt: String(r.last_opened_at), lastDigestVersion: r.last_digest_version == null ? null : Number(r.last_digest_version) } : null;
    },
    upsert(viewerId: string, matterId: string, lastOpenedAt: string, lastDigestVersion: number | null): void {
      db.prepare(
        `INSERT INTO view_state (viewer_id, matter_id, last_opened_at, last_digest_version) VALUES (?,?,?,?)
         ON CONFLICT (viewer_id, matter_id) DO UPDATE SET last_opened_at=excluded.last_opened_at, last_digest_version=excluded.last_digest_version`,
      ).run(viewerId, matterId, lastOpenedAt, lastDigestVersion);
    },
  };

  const aiCalls = {
    insert(c: AiCall, createdAt: string): void {
      db.prepare(
        `INSERT INTO ai_calls (matter_id, stage, model, input_tokens, output_tokens, cache_read_tokens, usd, created_at)
         VALUES (?,?,?,?,?,?,?,?)`,
      ).run(c.matterId, c.stage, c.model, c.inputTokens, c.outputTokens, c.cacheReadTokens, c.usd, createdAt);
    },
    totalUsd(matterId: string): number {
      const r = db.prepare("SELECT COALESCE(SUM(usd),0) AS u FROM ai_calls WHERE matter_id=?").get(matterId) as { u: number };
      return r.u;
    },
  };

  const oauthTokens = {
    get(): OauthTokenRow | null {
      const r = db.prepare("SELECT * FROM oauth_tokens WHERE id=1").get() as Row | undefined;
      return r ? { accessToken: String(r.access_token), refreshToken: s(r.refresh_token), expiresAt: s(r.expires_at), updatedAt: String(r.updated_at) } : null;
    },
    upsert(t: { accessToken: string; refreshToken: string | null; expiresAt: string | null }, now: string): void {
      db.prepare(
        `INSERT INTO oauth_tokens (id, access_token, refresh_token, expires_at, updated_at) VALUES (1,?,?,?,?)
         ON CONFLICT (id) DO UPDATE SET access_token=excluded.access_token, refresh_token=excluded.refresh_token,
           expires_at=excluded.expires_at, updated_at=excluded.updated_at`,
      ).run(t.accessToken, t.refreshToken, t.expiresAt, now);
    },
  };

  return { items, events, documentTexts, extractions, digests, syncRuns, shares, shareViews, shareResponses, viewState, aiCalls, oauthTokens };
}
export type Repos = ReturnType<typeof createRepos>;
