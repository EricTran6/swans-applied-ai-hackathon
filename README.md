# Case Lens: AI-Powered Legal Case Dashboard

A visual case digest tool that helps law firms and medical providers understand personal injury matters faster. Two audiences, two views:

1. **Attorney Dashboard**: Get up to speed in 90 seconds with a visual brief, key metrics (case value vs. coverage), action items, timeline, and full-text search.
2. **Provider Share**: Treating providers see case status, their role in treatment, what you need from them, and their bill—without case strategy, valuations, or other providers' confidential information.

## Screenshots
Placeholder: Attorney dashboard (brief + KPIs + injuries + action board) | Provider view (mobile, status rail + needs) | Share builder (checklist with hard-deny locks)

## What You're Looking At

**Goal**: Digest a live Clio Manage case (read-only) into a visual summary, cached and re-used, with every fact traceable to its source.

**Core principles**:
- **No hardcoded data**: The matter and provider names come from the URL and Clio API; logic is generic personal-injury rules.
- **Read-only to Clio**: Only GET requests; persistence lives in our own SQLite database.
- **Every fact is traceable**: Click any date, dollar amount, or finding to open the source note, email, document (with quote highlighted), or PDF at the exact page.
- **Cached & efficient**: Digest computed once per input-set change (keyed by content hash); second opens cost zero API calls.

## Prerequisites

- Node.js 20+
- An Anthropic API key (`ANTHROPIC_API_KEY`)
- Access to Clio Manage (OAuth connection or API token)

## Quick Start

### 1. Install & prepare

```bash
npm ci
cp .env.example .env
```

### 2. Set up environment variables

Edit `.env` and fill in:
- `ANTHROPIC_API_KEY`: Your Anthropic API key
- `CLIO_BASE_URL`: Clio URL (default: `https://app.clio.com`)
- `CLIO_ACCESS_TOKEN` and `CLIO_REFRESH_TOKEN`: OAuth tokens (OR)
- `CLIO_CLIENT_ID`, `CLIO_CLIENT_SECRET`: For OAuth flow

**Option A: Use OAuth in the app**
```bash
npm run dev
```
Open `http://127.0.0.1:3000` → click `/connect` to authorize Clio. Tokens stored in the database.

**Option B: Paste a token directly**
```bash
echo "CLIO_ACCESS_TOKEN=<your-token>" >> .env
npm run dev
```

### 3. Run the dev server

```bash
npm run dev
```

Open `http://127.0.0.1:3000`:
- **Landing page** (`/`): List of accessible matters. Click one to open the brief.
- **Attorney dashboard** (`/matters/[matterId]`): Visual digest with header, KPIs, brief, top-10, action board, injuries, timeline.
- **Share builder** (`/matters/[matterId]/share`): Create and manage provider shares.
- **Provider view** (`/s/[token]`): Mobile-friendly share link (expires, can be revoked).

### 4. Demo with fixtures (no Clio access needed)

To preview with synthetic data:

```bash
CLIO_FIXTURE_DIR=fixtures/clio npm run dev
```

This reads from `fixtures/clio/*.json` instead of making HTTP requests. The matter ID in the URL is ignored; fixtures always use the sample client "Jane Doe".

## Scripts

- `npm run dev`: Start the dev server on `127.0.0.1:3000`
- `npm run build`: Build for production
- `npm run typecheck`: Check TypeScript
- `npm test`: Run tests (unit tests for digest logic, share filtering, validators)
- `npm run digest <matterId>`: CLI to sync and digest a matter; prints cost and summary (requires `CLIO_*` and `ANTHROPIC_API_KEY` in `.env`)

### Example: Digest a live matter

```bash
CLIO_MATTER_ID=1234 npm run digest 1234
```

Output includes the computed `Digest` JSON and a cost breakdown.

## Architecture

```
Frontend (Next.js App Router, TypeScript, React 19, Tailwind, shadcn/ui)
  ├── Attorney UI (src/app/matters/[matterId]/page.tsx)
  │   ├── Header: client info, KPI row, cache badge
  │   ├── Brief: cited claims with source chips
  │   ├── KPI bar: value vs. coverage waterfall
  │   ├── Top 10: scored by recency + signal terms
  │   ├── Action board: overdue / upcoming / waiting on
  │   ├── Injuries: grouped by body part, BoP page refs
  │   └── Full timeline: sortable table (depth toggle)
  │
  ├── Provider share (src/app/s/[token]/)
  │   ├── Status rail: case lifecycle
  │   ├── Coverage chip (limits optional)
  │   ├── What we need: templated tasks for this provider
  │   ├── Your bill: with stale flag
  │   └── Upcoming appointments + updates
  │
  └── Evidence drawer (src/components/evidence/)
      ├── Click any source chip → side panel
      ├── Shows record text, quote highlighted
      ├── PDFs rendered page-by-page with pdfjs-dist
      └── "Open in Clio" link to the matter

Backend (Node.js, SQLite, Claude API)
  ├── GET-only Clio client (src/lib/clio/)
  │   ├── Bearer token from OAuth or .env
  │   ├── Paging + rate-limit aware
  │   ├── Normalizes 8 record types
  │   └── Content-hash diffing for change detection
  │
  ├── Data ingestion (src/lib/ingest/)
  │   ├── Syncs matter from Clio
  │   ├── Stores items + change events in SQLite
  │   ├── Downloads & extracts text from PDFs
  │   └── Tracks sync status (last run, progress)
  │
  ├── Deterministic digest core (src/lib/digest/)
  │   ├── KPIs: case value, coverage, firm spend, last contact, SOL
  │   ├── Action board: overdue, upcoming, waiting-on rules
  │   ├── Scoring: top-10 items by signal + recency
  │   ├── Change diff: "what's new since"
  │   └── Validator: drops invalid source refs
  │
  ├── AI pipeline (src/lib/ai/)
  │   ├── Extract facts: Haiku → coverage, value, liens
  │   ├── Extract injuries: Sonnet → from Bill of Particulars text
  │   ├── Synthesize: Sonnet → brief, why-lines, open questions
  │   └── Cost log: every call tracked in DB
  │
  ├── Share library (src/lib/share/)
  │   ├── Fail-closed filtering: per-provider, never leaks valuation/notes
  │   ├── Templated needs & updates (structured text only)
  │   ├── Tokens: 32 random bytes, sha256 at rest
  │   ├── Provider bill stale flag
  │   └── AI flags: can only downgrade, not raise inclusion
  │
  ├── API routes (src/app/api/)
  │   ├── GET /api/matters: list open matters
  │   ├── GET /api/case?matterId=: brief + since-last-open
  │   ├── POST /api/sync: start background sync
  │   ├── GET /api/sync: status + progress
  │   ├── POST /api/digest/refresh: compute or recompute
  │   ├── GET /api/source?drawerKey=: cached record for evidence drawer
  │   ├── GET /api/documents/[id]/file: cached PDF (matter-scoped)
  │   ├── POST /api/share/draft: candidates for a provider
  │   ├── POST /api/share: create (stores snapshot)
  │   ├── GET /api/share: history + views
  │   ├── POST /api/share/[token]/view: view beacon
  │   ├── POST /api/share/[token]/respond: provider reply (kind, date, note)
  │   └── POST /api/share/revoke: expire a share
  │
  └── Database (src/lib/db/, src/lib/db/schema.sql)
      ├── items: current Clio records (normalized)
      ├── item_events: change history (new / changed / deleted)
      ├── document_texts: per-page PDF text
      ├── digests: cached full digests + version
      ├── extractions: per-item AI cache
      ├── shares: share metadata + frozen ProviderView
      ├── share_responses: provider replies + timestamps
      ├── view_state: "since last open" tracking
      ├── ai_calls: cost log (model, tokens, USD)
      └── oauth_tokens: Clio token refresh (auto-refreshed)

Data flow:
  1. User opens /matters/[matterId]
  2. Browser fetches GET /api/case?matterId=…
  3. API checks digests table for cached digest (same input hash)
  4. If cached, return it; cost = $0.00 this open
  5. If not cached:
     - syncMatter(): fetch from Clio, store in items, write events
     - buildDigest():
       - computeDeterministic(): KPIs, action board, scoring (zero API)
       - extractFacts(): Haiku → coverage/value/liens (cached)
       - extractInjuries(): Sonnet → BoP page refs (cached)
       - synthesize(): Sonnet → brief, why, open questions (one call)
       - validateRefs(): drop invalid refs, count warnings
     - Save digest, log cost
  6. Browser renders the digest
  7. User clicks a source chip → drawer fetches GET /api/source?drawerKey=…
  8. Evidence drawer renders text or PDF + quote highlight
```

## How Each Panel Is Computed

**Header & KPIs** (code + Clio metadata, no AI):
- `case_value`: Attorney custom field (currency type) OR none recorded
- `coverage`: From custom field "Insurance" (UM/UIM, BI, no-fault) parsed by Haiku; math in code
- `firm_spend`: Sum of expense rows where `kind === 'firm'` (parsed by shape)
- `last_client_contact`: Latest communication where client is sender/receiver; notes also count
- `next_deadline`: Earliest open task or future calendar entry
- `SOL`: Calculated in code; overdue only if open and past the date

**Brief** (4–5 sentences, Sonnet synthesis):
- Input: the most recent "summary/posture"-like note, plus all notes/comms mentioning coverage or value
- Output: claims with source refs (note/email/task/document)
- **Traceable**: Each claim is a `SourceRef`; click to open the evidence drawer

**Top 10** (scored by code, "why" by Sonnet):
- **Scoring** (deterministic, no AI): recency decay (half-life 180 days) + signal terms (limit, coverage, lien, surgery, offer, IME, posture) + dollar amounts + still-open task cross-refs
- **Why-line** (one per item, Sonnet): "scheduled IME on 10-5" or "second surgery undated after 5 requests"

**Action Board** (code only):
- **Overdue**: Open task with `dueAt < now`
- **Upcoming**: Open task or calendar entry within 30 days
- **Waiting on**: Task assigned to a contact or matching their name, with outbound comms to that contact and no reply; counts requests and days silent
- **Suggested**: (Not implemented; reserved for future AI)

**Injuries** (Sonnet, sourced from Bill of Particulars only):
- Choose document generically: name/folder matching "bill of particulars" / "pleading" / "complaint", else fallback
- Extract per-page: name, body part, status, first documented date
- **Traceable**: Page refs; click to open PDF at that page with the quote highlighted

**Provider View** (fail-closed, zero secrets leaked):
- **Never includes**: Note text, case strategy, valuation, other providers' bills, Medicaid lien, case value
- **Includes**: Status, stage, this provider's own bill + stale flag, their tasks (templated), coverage limits (if attorney opts in), upcoming treatment calendar
- **View snapshot**: Frozen at send time; attorney can revoke or toggle visibility before sending
- **Templated text only**: AI can suggest needs (Haiku) but only via templates; keywords downgrade inclusion

**Cached digest**:
- Keyed by `inputSetHash` (sha256 of sorted record content hashes)
- Unchanged hash → zero AI calls, $0.00 cost
- Second open on the same matter = instant load

## Data Storage

- **SQLite database**: `./data/app.db` (created on first run)
  - Contains: Clio records snapshot, change history, cached digests, AI cost log, OAuth tokens, share metadata
  - Never contains: raw Clio API tokens (those are encrypted in memory only)
  
- **PDFs**: `./data/docs/<clioId>-<versionUuid>.pdf` (cached from Clio)
  - Downloaded once per version, never fetched again
  - Served via `GET /api/documents/[id]/file` (matter-scoped; no path traversal)

- **Fixtures** (dev/test only): `fixtures/clio/*.json`, `fixtures/documents/`, `fixtures/sample-digest.json`
  - Synthetic client "Jane Doe", no real case data
  - Used when `CLIO_FIXTURE_DIR` is set

## Read-Only Guarantee

Every API client has a guard: **only GET requests are allowed to Clio**. Any non-GET method throws immediately. Persistence (shares, cache, view tracking) goes to our SQLite database, never back to Clio.

```typescript
// GET-only client (src/lib/clio/index.ts)
if (method !== 'GET') throw new Error(`Only GET allowed; got ${method}`);
```

## Known Limitations

- **No attorney login**: The app runs on `localhost:3000` (single user); OAuth is for Clio token refresh only.
- **No push/email alerts**: Providers see changes when they next visit their share link (no webhooks).
- **Scanned pages not OCR'd**: Injuries come from text-layer PDFs (Bill of Particulars); the other 15 scanned pages are not indexed.
- **Clio per-record deep links not used**: The in-app evidence drawer is the source of truth; Clio per-record URLs are optional.
- **Dev-only routes removed at submit**: `src/app/dev/**` (fixture preview pages) will be deleted before final submission.

## Development

### Run tests

```bash
npm test
```

Tests cover:
- Digest logic: KPIs, action board, scoring, change diff, validator
- Share filtering: no valuation/strategy/bills leak to providers
- API routes: error handling, 404 for bad tokens, sync status

### TypeScript

```bash
npm run typecheck
```

### Build

```bash
npm run build
```

## Environment Variables

Copy `.env.example` to `.env` and fill in:

| Variable | Purpose | Example |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude API key | `sk-ant-…` |
| `CLIO_BASE_URL` | Clio domain | `https://app.clio.com` |
| `CLIO_ACCESS_TOKEN` | API token (fallback) | `oauth2:…` |
| `CLIO_REFRESH_TOKEN` | OAuth refresh (optional) | `…` |
| `CLIO_CLIENT_ID` | OAuth client ID | `…` |
| `CLIO_CLIENT_SECRET` | OAuth secret (never in `.env`, env var only) | `…` |
| `CLIO_FIXTURE_DIR` | Dev: read from fixtures | `fixtures/clio` |
| `DATABASE_PATH` | SQLite file | `./data/app.db` |
| `APP_BASE_URL` | For share links | `http://127.0.0.1:3000` |
| `SHARE_TTL_DAYS` | Share expiry | `7` |
| `SHARE_IP_SALT` | Random salt for view hashing | (random, set once) |
| `FIRM_NAME` | Shown to providers | `Swans Law` |
| `MODEL_EXTRACT` | Haiku model | `claude-haiku-4-5` |
| `MODEL_SYNTH` | Sonnet model | `claude-sonnet-5-5` |
| `MODEL_SCAN` | Sonnet model (injuries) | `claude-sonnet-5-5` |

## Tech Stack

- **Framework**: Next.js 15 (App Router, React 19, TypeScript)
- **Styling**: Tailwind CSS + shadcn/ui components
- **Database**: SQLite via better-sqlite3 (no migrations; `CREATE TABLE IF NOT EXISTS`)
- **PDF**: pdfjs-dist (text extraction + rendering)
- **AI**: Anthropic Claude API (structured output, token counting)
- **Testing**: Vitest
- **Build**: Next.js compiler + ESLint

## License

Proprietary; built for the Swans Applied AI Hackathon.
