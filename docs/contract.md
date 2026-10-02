# Shared contract

Lead-owned. Every agent reads this before writing code. Nobody changes it without the lead; propose changes in your report.
Source decisions: `docs/research/SYNTHESIS.md`. Live data facts: `docs/research/sapini-data-profile.md` (when present; it wins over this file on Clio field names).

## 1. Stack and layout

- Next.js 15 App Router, TypeScript strict, Tailwind, shadcn/ui, lucide-react, date-fns. Node runtime only (no edge).
- SQLite via **better-sqlite3**, raw SQL in `src/lib/db/schema.sql` (no ORM, no migrations: `CREATE TABLE IF NOT EXISTS` on boot). `next.config.ts`: `serverExternalPackages: ['better-sqlite3']`.
- Claude via `@anthropic-ai/sdk`. Tests: vitest. CLI scripts: tsx.
- Dev server: `next dev -H 127.0.0.1 -p 3000`. Single user, localhost, no auth gate (share pages are token-gated).
- Lead installs **all** dependencies and shadcn components in Phase 0. Agents do not edit `package.json`, `next.config.ts`, `tsconfig.json`, `src/components/ui/**`.

```
src/
  lib/types.ts            # this contract in TS (lead)
  lib/clio/               # GET-only client, normalizers, clioUrl()      (stream A)
  lib/ingest/             # syncMatter(), content hashing, item events   (stream A)
  lib/ai/                 # prompts, Claude calls, extraction, synthesis (stream B)
  lib/digest/             # validator, KPIs, action board, stage rules   (stream B)
  lib/db/                 # schema.sql, connection, repos                (stream C)
  lib/share/              # presets, candidate builder, tokens, ProviderView builder (stream C)
  app/api/**              # route handlers                               (stream C)
  app/page.tsx, app/matters/[matterId]/**   # attorney UI                (stream D)
  components/brief/**, components/evidence/**                            (stream D)
  app/s/[token]/**, components/share/**     # share builder + provider UI (stream E)
  components/ui/**        # shadcn (lead)
fixtures/                 # sample-digest.json, sample-items.json (lead; fake names, dev/test only)
scripts/build-digest.ts   # CLI: sync + digest one matter by id         (stream B)
data/app.db               # SQLite file (gitignored)
```

Runtime never imports `fixtures/`. No Sapini ids, names or numbers in `src/`; the matter id comes from the URL or CLI arg.

## 2. Env vars (`.env`, mirrored with blank values in `.env.example`)

| Var | Example / default | Used by |
|---|---|---|
| `ANTHROPIC_API_KEY` | | B |
| `CLIO_BASE_URL` | `https://app.clio.com` (append `/api/v4` if missing, as `scripts/clio_dump.py` does) | A |
| `CLIO_ACCESS_TOKEN`, `CLIO_REFRESH_TOKEN` | | A |
| `CLIO_CLIENT_ID`, `CLIO_CLIENT_SECRET` | (refresh only) | A |
| `CLIO_FIXTURE_DIR` | unset; `.cache/clio` = read `scripts/clio_dump.py` output (`matter.json`, `notes.json`, `communications.json`, ...) instead of HTTP | A |
| `DATABASE_PATH` | `./data/app.db` | C |
| `APP_BASE_URL` | `http://127.0.0.1:3000` | C (share links) |
| `SHARE_TTL_DAYS` | `7` | C |
| `SHARE_IP_SALT` | random string | C |
| `FIRM_NAME` | shown on provider page | C, E |
| `MODEL_EXTRACT` | `claude-haiku-4-5` | B |
| `MODEL_SYNTH` | `claude-sonnet-5-5` | B |
| `MODEL_SCAN` | `claude-sonnet-5-5` | B |

`CLIO_BASE_URL` and `CLIO_ACCESS_TOKEN` match `scripts/clio_dump.py`. `.cache/` and `data/` must be gitignored (lead, Phase 0).

## 3. Normalized Clio records (`src/lib/types.ts`)

```ts
export type SourceType =
  | 'matter' | 'custom_field' | 'contact' | 'note' | 'communication'
  | 'task' | 'calendar_entry' | 'expense' | 'document';

export interface RecordBase {
  sourceType: SourceType;
  clioId: string;          // always string (custom field value ids look like "text_line-55001")
  matterId: string;
  createdAt: string;       // ISO
  updatedAt: string;       // ISO
  sourceDate: string | null; // the business date: note.date, comm.occurredAt, task.dueAt, expense.date...
  title: string;           // one-line label for chips/lists
  bodyText: string;        // exact text sent to the LLM and used for quote matching ('' if none)
  clioUrl: string;         // from clioUrl(); falls back to the matter page
  contentHash: string;     // sha256 of canonical JSON of the normalized record minus hash/clioUrl
}
export interface Party { contactId: string | null; name: string; kind: 'Contact' | 'User' }
export interface CustomFieldValue extends RecordBase {
  sourceType: 'custom_field'; fieldId: string; name: string; fieldType: string;
  value: string | number | null; display: string;
}
export interface Matter extends RecordBase {
  sourceType: 'matter'; displayNumber: string; description: string;
  status: 'Open' | 'Pending' | 'Closed' | string; openDate: string | null; closeDate: string | null;
  practiceArea: string | null; clioStage: string | null;
  responsibleAttorney: Party | null; client: Party; customFields: CustomFieldValue[];
}
export interface Contact extends RecordBase {
  sourceType: 'contact'; name: string; kind: 'Person' | 'Company';
  email: string | null; phone: string | null; company: string | null;
  role: string | null;     // relationship description on this matter, e.g. "Treating physician"
  isClient: boolean;
}
export interface Note extends RecordBase { sourceType: 'note'; subject: string; author: Party | null }
export interface Communication extends RecordBase {
  sourceType: 'communication'; kind: 'Email' | 'Phone' | string; subject: string;
  occurredAt: string; senders: Party[]; receivers: Party[];
}
export interface Task extends RecordBase {
  sourceType: 'task'; name: string; status: 'pending' | 'in_progress' | 'complete' | string;
  priority: string | null; dueAt: string | null; completedAt: string | null; assignee: Party | null;
}
export interface CalendarEntry extends RecordBase {
  sourceType: 'calendar_entry'; summary: string; location: string | null;
  startAt: string; endAt: string | null; allDay: boolean; attendees: Party[];
}
export interface Expense extends RecordBase {
  sourceType: 'expense'; date: string; total: number; category: string | null;
  description: string; billed: boolean;
}
export interface Document extends RecordBase {
  sourceType: 'document'; name: string; contentType: string | null; size: number | null;
  folder: string | null; latestVersionId: string | null;
  pageCount: number | null; textLayer: boolean | null;   // filled by scan step if run
}
export type ClioRecord = Matter | CustomFieldValue | Contact | Note | Communication
  | Task | CalendarEntry | Expense | Document;
```

## 4. Provenance and Digest

```ts
export type Derivation = 'stated' | 'inferred' | 'clio-metadata';
export interface SourceRef {
  value: string;           // the fact/date/number this ref supports, as displayed
  sourceType: SourceType; clioId: string; sourceDate: string | null;
  quote: string | null;    // verbatim span of record.bodyText (or of the PDF page for documents)
  page?: number;           // documents only, absolute 1-indexed
  clioUrl: string; derivation: Derivation;
  quoteVerified: boolean;  // true = substring match passed; false only allowed for page refs
}
export interface Claim { text: string; refs: SourceRef[] }  // refs.length >= 1 after validation

export type KpiKey = 'case_value' | 'coverage' | 'firm_spend' | 'last_client_contact' | 'next_deadline';
export interface Kpi {
  key: KpiKey; label: string; display: string;   // "$100k cap · specials $118,400"
  value: number | null; unit: 'usd' | 'days' | 'date' | 'count' | 'text';
  range?: { low: number; high: number; cap: number | null };
  status: 'ok' | 'warn' | 'danger' | 'unknown';  // unknown => "Not recorded in Clio"
  asOf: string; refs: SourceRef[]; computedBy: 'code'; note?: string;
}
export interface CoverageLayer {
  kind: 'BI' | 'UM/UIM' | 'No-fault/PIP' | 'MedPay' | 'Umbrella' | 'Health/Lien' | 'Other';
  perPerson: number | null; perAccident: number | null; carrier: string | null; refs: SourceRef[];
}
export interface RankedItem { rank: number; title: string; why: string;
  category: 'medical' | 'insurance' | 'liability' | 'client' | 'litigation' | 'money' | 'other';
  date: string | null; ref: SourceRef }
export interface ActionItem { id: string; title: string; due: string | null; owner: string | null;
  origin: 'clio-task' | 'clio-calendar' | 'ai-suggested'; daysLate?: number; daysSilent?: number;
  refs: SourceRef[] }
export interface TimelineEvent { id: string;  // sha1(date|title|first ref clioId)
  date: string; derivation: Derivation; title: string;
  category: 'incident' | 'treatment' | 'legal' | 'insurance' | 'communication' | 'money';
  refs: SourceRef[] }
export interface Injury { name: string; bodyPart: string | null; status: string | null;
  firstDocumented: string | null; refs: SourceRef[] }
export type StageKey = 'intake' | 'treatment' | 'records' | 'demand' | 'negotiation'
  | 'pleadings' | 'discovery' | 'mediation' | 'trial' | 'settlement' | 'disbursement' | 'closed';
export interface ChangeEntry { kind: 'new' | 'changed' | 'deleted'; sourceType: SourceType;
  clioId: string; title: string; detectedAt: string; clioUrl: string }

export interface Digest {
  matterId: string; version: number; createdAt: string; inputSetHash: string;
  header: { clientName: string; clientInitials: string; displayNumber: string; description: string;
    status: string; incidentDate: SourceRef | null; sol: { date: string; basis: string; refs: SourceRef[] } | null };
  brief: Claim[];                                  // 3-5 sentences
  kpis: Kpi[];
  coverage: CoverageLayer[];
  topTen: RankedItem[];                            // <= 10
  totalItems: number;                              // "10 that matter out of N"
  actionBoard: { overdue: ActionItem[]; upcoming: ActionItem[]; waiting: ActionItem[]; suggested: ActionItem[] };
  timeline: TimelineEvent[];
  injuries: Injury[];
  stage: { key: StageKey; label: string; evidence: SourceRef[]; inferred: true };
  openQuestions: Claim[];
  changeFeed: ChangeEntry[];                       // item events detected by the sync that built this version
  meta: { models: Record<string, string>; costUsd: number; droppedRefs: number;
    droppedClaims: number; warnings: string[] };
}
```

LLM output never uses `SourceRef` directly. It emits `LlmRef = { id: string /* "note:123" | "document:55" */, quote: string | null, page?: number }`; `src/lib/digest/validator.ts` hydrates `LlmRef` -> `SourceRef` from the item store.

## 5. Validator rules (`src/lib/digest/validator.ts`, unit-tested)

1. Unknown id: `id` not in this matter's current items -> drop the ref.
2. Quote: whitespace-normalized, case-insensitive, curly-quote-normalized substring of `bodyText` -> `quoteVerified: true`; otherwise drop the ref. `quote: null` allowed only for structured records (task, calendar_entry, expense, custom_field, matter) with `derivation: 'clio-metadata'`.
3. Pages: `page` only on documents, `1 <= page <= pageCount` else drop. Page refs keep `quoteVerified: false` (scan text not checkable) and the UI shows "model-read, check page".
4. A claim/row/event whose refs are all dropped is dropped. Count both in `meta`.
5. If >20% of refs are dropped, retry the synthesis call once listing the bad ids; then accept and add a warning.
6. `topTen` ids unique; `rank` reassigned 1..n in order.
7. Dates: a date is `stated` only if it appears in the quote; else downgrade to `inferred` (or `clio-metadata` if equal to the record's `sourceDate`).
8. KPIs, totals, counts, day deltas and SOL arithmetic are computed in code (`src/lib/digest/kpis.ts`). The LLM may extract a numeric fact only with a verified quote containing that number; code does all math. Precedence for case value: attorney custom field > quoted note > "Not recorded in Clio". Never an LLM-invented range.
9. Action board lanes are code: overdue = open task with `dueAt < now`; upcoming = open task or calendar entry in next 30 days; waiting = AI-flagged outbound request with no reply (needs ref) plus `daysSilent`; suggested = AI only, labeled.

## 6. SQLite (`src/lib/db/schema.sql`)

```sql
CREATE TABLE IF NOT EXISTS items (            -- current state of each Clio record
  matter_id TEXT NOT NULL, source_type TEXT NOT NULL, clio_id TEXT NOT NULL,
  updated_at TEXT NOT NULL, content_hash TEXT NOT NULL, record_json TEXT NOT NULL,
  first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, deleted_at TEXT,
  PRIMARY KEY (source_type, clio_id));
CREATE TABLE IF NOT EXISTS item_events (      -- written by sync when (updated_at, content_hash) differs
  id INTEGER PRIMARY KEY, matter_id TEXT NOT NULL, source_type TEXT NOT NULL, clio_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('new','changed','deleted')),
  content_hash TEXT, prev_hash TEXT, title TEXT NOT NULL, detected_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS extractions (      -- per-item AI cache
  source_type TEXT NOT NULL, clio_id TEXT NOT NULL, content_hash TEXT NOT NULL,
  extractor_version TEXT NOT NULL, facts_json TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (source_type, clio_id, content_hash, extractor_version));
CREATE TABLE IF NOT EXISTS digests (
  id INTEGER PRIMARY KEY, matter_id TEXT NOT NULL, version INTEGER NOT NULL,
  input_set_hash TEXT NOT NULL, synth_version TEXT NOT NULL, digest_json TEXT NOT NULL,
  cost_usd REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL, UNIQUE (matter_id, version));
CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY, matter_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,  -- sha256(token)
  recipient_label TEXT NOT NULL, recipient_contact_id TEXT,
  preset_json TEXT NOT NULL,                  -- allowlist snapshot used at send time
  included_ids_json TEXT NOT NULL, payload_json TEXT NOT NULL,  -- frozen ProviderView
  digest_version INTEGER NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT);
CREATE TABLE IF NOT EXISTS share_views (
  id INTEGER PRIMARY KEY, share_id TEXT NOT NULL, viewed_at TEXT NOT NULL,
  ip_hash TEXT, user_agent TEXT);
CREATE TABLE IF NOT EXISTS view_state (       -- "since last open"
  viewer_id TEXT NOT NULL, matter_id TEXT NOT NULL, last_opened_at TEXT NOT NULL,
  last_digest_version INTEGER, PRIMARY KEY (viewer_id, matter_id));
CREATE TABLE IF NOT EXISTS ai_calls (
  id INTEGER PRIMARY KEY, matter_id TEXT, stage TEXT NOT NULL, model TEXT NOT NULL,
  input_tokens INTEGER, output_tokens INTEGER, cache_read_tokens INTEGER, usd REAL, created_at TEXT NOT NULL);
```
`viewer_id` = httpOnly cookie `viewer` (random, set on first visit). Raw tokens, raw IPs and record text are never logged.

## 7. Module interfaces (the seams between streams)

```ts
// A: src/lib/clio/index.ts, src/lib/ingest/index.ts
export function clioGet<T>(path: string, params: Record<string, string>): Promise<T[]>; // GET only, follows meta.paging.next, honors Retry-After, max 2 in flight
export function clioUrl(type: SourceType, clioId: string, matterId: string): string;
export function listOpenMatters(): Promise<Pick<Matter, 'clioId'|'displayNumber'|'description'|'client'|'status'>[]>;
export function fetchMatterRecords(matterId: string): Promise<ClioRecord[]>;   // all 9 types, normalized
export function syncMatter(matterId: string): Promise<{ records: ClioRecord[]; events: ChangeEntry[] }>; // uses repos.items

// B: src/lib/ai/index.ts, src/lib/digest/index.ts
export function buildDigest(input: { matter: Matter; records: ClioRecord[]; changeFeed: ChangeEntry[];
  prev: Digest | null; cache: ExtractionCache; log: (c: AiCall) => void }): Promise<Omit<Digest,'version'>>;
export interface ExtractionCache { get(k: ExtractionKey): unknown | null; set(k: ExtractionKey, v: unknown): void }

// C: src/lib/db/index.ts exposes repos: items, events, extractions, digests, shares, views, viewState, aiCalls
// C: src/lib/share/index.ts
export function buildCandidates(d: Digest, records: ClioRecord[], preset: SharePreset): ShareCandidate[];
export function buildProviderView(d: Digest, records: ClioRecord[], includedIds: string[], recipient: string): ProviderView;
```

## 8. HTTP API (all JSON; errors `{ error: string }` with proper status)

| Method / path | Body / query | Response |
|---|---|---|
| GET `/api/matters` | | `{ matters: MatterSummary[] }` (cached 5 min) |
| GET `/api/case` | `?matterId=` | `{ matter, digest: Digest \| null, sinceLastOpen: ChangeEntry[], lastOpenedAt, shares: ShareSummary[] }` |
| POST `/api/digest/refresh` | `{ matterId, force?: boolean }` | `{ version, changed: number, costUsd, durationMs }` (synchronous; no-op + same version if `inputSetHash` unchanged and not force) |
| GET `/api/source` | `?type=&clioId=` | `{ record: ClioRecord }` for the evidence drawer (from cache, never live Clio) |
| POST `/api/view-state` | `{ matterId }` | `204` (called on banner dismiss, not on load) |
| POST `/api/share/draft` | `{ matterId, recipientLabel, recipientContactId?, preset?: SharePreset }` | `{ candidates: ShareCandidate[], counts: { shared, withheld } }` |
| POST `/api/share` | `{ matterId, recipientLabel, recipientContactId?, includedIds: string[], expiresInDays? }` | `{ shareId, url, expiresAt }` (url holds the raw token; shown once) |
| GET `/api/share` | `?matterId=` | `{ shares: ShareSummary[] }` (views count, firstViewedAt, lastViewedAt, revoked) |
| POST `/api/share/revoke` | `{ shareId }` | `204` |
| GET `/api/share/[token]` | | `ProviderView`; same `404 {error:'not found'}` for unknown/expired/revoked |
| POST `/api/share/[token]/view` | | `204` (client JS fires after render; prefetchers do not count) |
| GET `/api/documents/[id]/file` | | PDF bytes proxied from Clio (SHOULD; 303 handled without forwarding auth) |

`/s/*` and `/api/share/[token]*` responses set `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`. Pages: `/` matter picker, `/matters/[matterId]` brief, `/matters/[matterId]/share` builder, `/s/[token]` provider view.

## 9. Provider share

```ts
export type ShareCategory = 'status' | 'stage' | 'coverage' | 'appointments' | 'requests'
  | 'own_records' | 'other_records' | 'updates'
  | 'valuation' | 'settlement' | 'attorney_notes' | 'liability' | 'firm_expenses'
  | 'other_liens' | 'client_pii' | 'internal_comms';
export interface SharePreset { allow: ShareCategory[]; optIn: ShareCategory[] } // everything else denied
export interface ShareCandidate { id: string /* "task:123" or "kpi:coverage" */; category: ShareCategory;
  label: string; preview: string; included: boolean; hardDeny: boolean;
  flag: { level: 'ok' | 'review' | 'block'; reason: string } | null }
export interface ProviderView { firmName: string; recipientLabel: string; clientDisplayName: string; // "Justin S."
  status: { label: string; alive: 'active' | 'stalled' | 'closed'; lastFirmActivity: string };
  stage: { label: 'Treating' | 'Pre-suit negotiation' | 'In litigation' | 'Settled / paying liens' | 'Closed' };
  coverage: { kind: string; limit: string }[] | null; requests: { title: string; due: string | null }[];
  appointments: { title: string; date: string }[]; records: { name: string; date: string | null }[];
  updates: { date: string; text: string }[]; sharedAt: string; expiresAt: string }
```
Default preset (editable per share, stored as `preset_json`):

| Category | Default |
|---|---|
| status, stage, updates (coarse: "in litigation", "records requested") | allow |
| coverage (limits + carrier, no claim numbers) | allow, visible toggle |
| appointments and requests involving this provider | allow |
| own_records (documents naming this provider) | allow |
| other_records (other providers' records) | opt-in per item |
| valuation, settlement (offers, demands, case value), attorney_notes, internal_comms | **hard deny** (no toggle) |
| liability analysis, firm_expenses, other_liens (incl. Medicaid lien), client_pii (SSN, DOB, wages) | deny (toggle) |

Rules: `ProviderView` contains no Clio ids, no clioUrls, no quotes from notes, no dollar figures except coverage limits. It is frozen at send time (snapshot, not live). AI flags (Haiku, enum output) can only lower inclusion (`review`/`block`), never raise it; keyword fallback (`settle|offer|demand|strategy|privileged|valuation|lien`) if the AI call fails. Tokens: `crypto.randomBytes(32).toString('base64url')`, stored as sha256, compared with `timingSafeEqual`.

## 10. v2 deltas (authoritative: `src/lib/types.ts`)

`src/lib/types.ts` is the source of truth and supersedes sections 3, 4, 7 and 9 where they differ. Summary:
- `RecordBase`: `drawerKey` ("note:123"), optional `clioUrl`, `etag`; `contentHash` from projected fields/etag, never `updatedAt` (all timestamps are seed time).
- `Expense.kind` = `firm` (total set) | `provider_bill` (total null, `non_billable_total` set); `amount`, `providerContactId`, `billFilename`. Split by shape, never by the string "DEMO".
- `Contact.roleKind` from the relationship description; `Task.isSol`; `Matter.sol`.
- `DocumentText` per document version (pdfjs-dist); tables `document_texts`, `sync_runs`, `oauth_tokens`, `share_responses` added to `schema.sql`.
- Digest adds `client` (ClientSnapshot), `valueWaterfall`, `providerBills`, `TimelineEvent.milestone`, `RankedItem.score` (code-ranked), `ActionItem.waitingOn`, `Kpi.conflicts`, `Injury.status`, `header.sol.status`.
- AI seams: `ExtractedFacts` (coverage/value/liens with validated refs) feeds deterministic `computeDeterministic()`; `SynthesisOutput` holds brief, why-lines, open questions, status chips.
- Share: `ShareCandidate.providerContactId`; `ProviderView` adds `attorneyNote`, `needs`, `bill` (own bill only), `coverage.confirmed`, optional `careTeam`/`findings`; `ShareResponse` for provider replies. Dollar rule: no dollars except the recipient's own bill, and coverage limits only when the attorney toggles them on.
- Seams (stubs in place): `src/lib/{clio,pdf,ingest,auth,digest,ai,db,share}/index.ts`. Owners replace stubs; exported signatures are fixed.
- New API routes: `POST /api/sync {matterId}` -> 202 + `GET /api/sync?matterId=` -> `SyncStatus`; `GET /api/auth/clio/start`, `GET /api/auth/clio/callback`; `POST /api/share/[token]/respond {needId?, kind, promisedDate?, text?}` -> 204; `GET /api/documents/[id]/file` serves the cached PDF (matter-scoped); `GET /api/source?drawerKey=` -> `{ record, documentText? }`.
- Fixtures (synthetic, fake client): `fixtures/clio/*.json` (raw Clio shapes, same filenames as `.cache/clio`), `fixtures/documents/bill-of-particulars-sample.pdf`, `fixtures/sample-digest.json`, `fixtures/sample-provider-view.json`. Regenerate with `python3 fixtures/make_fixtures.py && python3 fixtures/make_sample_digest.py`.
