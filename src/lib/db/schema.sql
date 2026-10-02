-- Own DB (never Clio). CREATE IF NOT EXISTS on boot; no migrations.
CREATE TABLE IF NOT EXISTS items (            -- current state of each Clio record
  matter_id TEXT NOT NULL, source_type TEXT NOT NULL, clio_id TEXT NOT NULL,
  etag TEXT, content_hash TEXT NOT NULL, record_json TEXT NOT NULL,
  first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, deleted_at TEXT,
  PRIMARY KEY (source_type, clio_id));
CREATE TABLE IF NOT EXISTS item_events (      -- written by sync when content_hash differs (never by updated_at)
  id INTEGER PRIMARY KEY, matter_id TEXT NOT NULL, source_type TEXT NOT NULL, clio_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('new','changed','deleted')),
  content_hash TEXT, prev_hash TEXT, title TEXT NOT NULL, source_date TEXT, detected_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS document_texts (   -- extracted PDF text per document version
  clio_id TEXT NOT NULL, version_uuid TEXT NOT NULL, page_count INTEGER NOT NULL,
  pages_json TEXT NOT NULL, file_path TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (clio_id, version_uuid));
CREATE TABLE IF NOT EXISTS extractions (      -- per-item AI cache
  source_type TEXT NOT NULL, clio_id TEXT NOT NULL, content_hash TEXT NOT NULL,
  extractor_version TEXT NOT NULL, facts_json TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (source_type, clio_id, content_hash, extractor_version));
CREATE TABLE IF NOT EXISTS digests (
  id INTEGER PRIMARY KEY, matter_id TEXT NOT NULL, version INTEGER NOT NULL,
  input_set_hash TEXT NOT NULL, synth_version TEXT NOT NULL, digest_json TEXT NOT NULL,
  cost_usd REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL, UNIQUE (matter_id, version));
CREATE TABLE IF NOT EXISTS sync_runs (        -- gap 5: refresh status
  id INTEGER PRIMARY KEY, matter_id TEXT NOT NULL, state TEXT NOT NULL,
  started_at TEXT NOT NULL, finished_at TEXT, message TEXT);
CREATE TABLE IF NOT EXISTS oauth_tokens (     -- gap 1: Clio OAuth (single-tenant local app)
  id INTEGER PRIMARY KEY CHECK (id = 1), access_token TEXT NOT NULL, refresh_token TEXT,
  expires_at TEXT, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY, matter_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,  -- sha256(token)
  recipient_label TEXT NOT NULL, recipient_contact_id TEXT,
  preset_json TEXT NOT NULL, included_ids_json TEXT NOT NULL, payload_json TEXT NOT NULL,  -- frozen ProviderView
  attorney_note TEXT, shared_count INTEGER NOT NULL DEFAULT 0, withheld_count INTEGER NOT NULL DEFAULT 0,
  digest_version INTEGER NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT);
CREATE TABLE IF NOT EXISTS share_views (
  id INTEGER PRIMARY KEY, share_id TEXT NOT NULL, viewed_at TEXT NOT NULL, ip_hash TEXT, user_agent TEXT);
CREATE TABLE IF NOT EXISTS share_responses (  -- gap 7: provider replies
  id TEXT PRIMARY KEY, share_id TEXT NOT NULL, need_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('sent','will_send','note')),
  promised_date TEXT, text TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS view_state (       -- "since last open"
  viewer_id TEXT NOT NULL, matter_id TEXT NOT NULL, last_opened_at TEXT NOT NULL,
  last_digest_version INTEGER, PRIMARY KEY (viewer_id, matter_id));
CREATE TABLE IF NOT EXISTS ai_calls (
  id INTEGER PRIMARY KEY, matter_id TEXT, stage TEXT NOT NULL, model TEXT NOT NULL,
  input_tokens INTEGER, output_tokens INTEGER, cache_read_tokens INTEGER, usd REAL, created_at TEXT NOT NULL);

-- Indexes (T04)
CREATE INDEX IF NOT EXISTS idx_items_matter ON items (matter_id, source_type);
CREATE INDEX IF NOT EXISTS idx_item_events_matter ON item_events (matter_id, detected_at);
CREATE INDEX IF NOT EXISTS idx_digests_matter ON digests (matter_id, version);
CREATE INDEX IF NOT EXISTS idx_sync_runs_matter ON sync_runs (matter_id, id);
CREATE INDEX IF NOT EXISTS idx_shares_matter ON shares (matter_id, created_at);
CREATE INDEX IF NOT EXISTS idx_share_views_share ON share_views (share_id);
CREATE INDEX IF NOT EXISTS idx_share_responses_share ON share_responses (share_id);
CREATE INDEX IF NOT EXISTS idx_ai_calls_matter ON ai_calls (matter_id);
