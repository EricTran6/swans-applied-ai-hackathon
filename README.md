# Case Lens: AI-Powered Legal Case Dashboard

Case Lens reads a live personal-injury matter from Clio Manage (read-only) and turns it into a visual, cited brief. It serves two audiences:

1. **Attorneys and staff** get up to speed in about two minutes: a cited brief, KPIs, a story-so-far timeline, a "who gets paid" recovery map, the action board, injuries, and every record one click away.
2. **Treating medical providers** get a curated share link that shows case status, what the firm needs from them, and their own bill. Case strategy, valuation, and other providers' information are never included.

## Principles

- **No hardcoded case data.** The matter comes from the URL and the Clio API. All logic is generic personal-injury rules.
- **Read-only to Clio.** The Clio client only issues GET requests. Shares, caches, and view tracking live in our own SQLite database.
- **Every fact is traceable.** Click any date, dollar amount, or finding to open the source note, email, task, or document. PDFs open at the cited page with the quote highlighted.
- **Digest once, then cache.** The digest is keyed by a hash of the matter's record contents. Opening an unchanged matter makes zero AI calls and costs $0.00.

## Prerequisites

- Node.js 20+
- An Anthropic API key
- A Clio Manage account (OAuth app credentials, or an access token)

## Quick start

```bash
npm ci
cp .env.example .env    # then fill in the values below
npm run dev             # http://127.0.0.1:3000
```

Connect Clio in one of two ways:

- **OAuth (recommended):** set `CLIO_CLIENT_ID` and `CLIO_CLIENT_SECRET`, register `http://127.0.0.1:3000/api/auth/clio/callback` as the redirect URI in Clio, then open the app and click **Connect Clio**. Tokens are stored in the local database and refreshed automatically.
- **Access token:** set `CLIO_ACCESS_TOKEN` in `.env`.

Then pick a matter on the home page and open its brief. The first open syncs from Clio and builds the digest (about $0.15 in AI calls). Later opens are served from cache.

### Demo with fixtures (no Clio access)

```bash
CLIO_FIXTURE_DIR=fixtures/clio npm run dev
```

The Clio client reads `fixtures/clio/*.json` instead of making HTTP requests. The fixtures are a synthetic client ("Jane Doe"), not real case data.

## Pages

| Route | What it shows |
|---|---|
| `/` | Home dashboard: Clio connection status, a "Today" strip (overdue, due soon, new activity), a card per open matter, provider share activity, and a short "how it works" |
| `/connect` | Clio OAuth connection |
| `/matters/[matterId]` | Attorney brief for one matter (see below) |
| `/matters/[matterId]/share` | Share builder for sending a provider a curated view |
| `/s/[token]` | Provider share page, mobile-first, expiring and revocable |

### Attorney brief

- **Header:** client, stage (inferred from Clio records), last client contact, next touchpoint, an "Open in Clio" link, the cache/cost badge, and a refresh action. A warnings banner groups anything the digest could not verify.
- **KPI row:** case value range against the coverage cap, coverage layers, specials (medical bills), firm spend, last client contact, and next deadline.
- **Brief:** four to five cited sentences, open questions, and "what reaches the client".
- **Story so far:** a timeline strip of milestones, with long quiet gaps compressed and a Today marker.
- **Who gets paid:** a settlement slider capped at the live coverage limit. It splits each dollar across attorney fee, firm costs, liens, each provider's bill, and the client. It flags underwater cases and shows the provider reduction the client needs to net a target. This is pure tested code with no AI, and it is never shared with providers.
- **Provider bills**, **top 10 that matter** (of all items in Clio, each with a "why" line), and the **action board** (overdue, upcoming, waiting on).
- **Injuries** extracted from the Bill of Particulars, with page citations.
- **Everything:** the full sortable record table, for drilling past the two-minute view.
- **New since last open:** changed items are marked, and a picker compares against any earlier date.
- **Print/PDF export** keeps colors.

### Share builder and provider view

The attorney picks a provider and sees a **live preview** of exactly what that provider will receive. Categories that must never be shared (valuation, strategy, notes, other providers' bills and appointments, Medicaid lien) are locked and show the reason. Coverage limits are opt-in per share. Each share is frozen at send time, and the attorney sees when it was opened and can revoke it.

The provider sees case status, an optional note from the attorney, **what we need from you** (they can reply in place), their bill on file, upcoming appointments, records on file, and dated updates. Care team and findings appear only when the attorney opts in and a HIPAA authorization is on file. A footer lists what is not shared.

## How it works

```
Clio (GET only) ──> sync ──> SQLite items + change events + PDF text
                                   │
                                   ▼
                   deterministic core (no AI): KPIs, action board,
                   top-10 scoring, timeline, change diff, recovery map
                                   │
                                   ▼
                   AI stages (cached per record / document version):
                     Haiku   → coverage layers, case value, liens
                     Sonnet  → injuries from Bill of Particulars
                     Sonnet  → brief, why-lines, open questions
                                   │
                                   ▼
                   validator drops any claim whose source ref is invalid
                                   │
                                   ▼
                   digest saved, keyed by input-set hash + stage versions
```

1. Opening a brief calls `GET /api/case?matterId=…`.
2. If a digest exists for the same input hash and stage versions, it is returned as is (no AI, $0.00).
3. Otherwise the app syncs from Clio, rebuilds only the stages whose inputs changed, validates references, logs every AI call with tokens and USD, and saves the digest.
4. Clicking a source chip opens the evidence drawer via `GET /api/source`. PDFs render in the browser with pdfjs-dist.

### Where each panel comes from

| Panel | Source |
|---|---|
| KPIs, action board, top-10 ranking, timeline, change diff, recovery map | Code only |
| Coverage, case value, liens | Haiku, from custom fields and notes, with validated quotes |
| Injuries | Sonnet, from the Bill of Particulars text layer, page-cited |
| Brief, why-lines, open questions | Sonnet, one synthesis call |
| Provider share | Code-built and fail-closed. AI flags can only lower an item's inclusion, never raise it. All text is templated. |

### Code map

| Path | Purpose |
|---|---|
| `src/lib/clio/` | GET-only Clio client: paging, rate limits, normalization, document download allowlist, fixture mode |
| `src/lib/auth/` | Clio OAuth and token refresh |
| `src/lib/ingest/` | Sync, content-hash change detection, PDF text extraction |
| `src/lib/digest/` | Deterministic core (KPIs, actions, ranking, timeline, recovery, validator) |
| `src/lib/ai/` | Model calls, extraction and synthesis prompts, cost accounting |
| `src/lib/share/` | Provider-view filtering, templates, tokens, provider responses |
| `src/lib/server/` | Request helpers, digest pipeline, share lookup |
| `src/lib/db/` | SQLite schema and repositories |
| `src/middleware.ts` | Network gate: non-loopback hosts can reach only the share surface |
| `src/components/` | `home/`, `brief/`, `evidence/`, `share/`, `nav/`, `ui/` (shadcn on Base UI) |

### API routes

| Method and path | Purpose |
|---|---|
| `GET /api/auth/clio/start`, `GET /api/auth/clio/callback` | Clio OAuth flow |
| `GET /api/matters` | Open matters from Clio |
| `GET /api/matters/overview` | Home dashboard data (one cached Clio call, the rest from the DB) |
| `GET /api/case?matterId=&since=` | Digest plus changes since the last open or a chosen date |
| `POST /api/sync`, `GET /api/sync` | Start a background sync; poll its status |
| `POST /api/digest/refresh` | Build or rebuild the digest |
| `POST /api/view-state` | Record that the attorney opened the matter |
| `GET /api/source` | Cached record for the evidence drawer |
| `GET /api/documents/[id]/file` | Cached PDF, scoped to the matter |
| `POST /api/share/draft` | Share candidates for a provider |
| `POST /api/share/preview` | Live preview (nothing persisted) |
| `POST /api/share`, `GET /api/share` | Create a share; list shares and views |
| `POST /api/share/revoke` | Expire a share |
| `GET /api/share/[token]` | Provider view (public) |
| `POST /api/share/[token]/view`, `POST /api/share/[token]/respond` | View beacon; provider reply (public) |

## Security and data

- **Read-only to Clio.** The HTTP client throws on any non-GET method. The only POST to Clio is the OAuth token exchange, which does not write data.
- **No attorney login.** The attorney app is meant for localhost. `src/middleware.ts` returns 404 for any non-loopback request except the share page, its three share API routes, and static assets. Share pages cannot be framed.
- **Share tokens** are 32 random bytes and stored only as sha256 hashes. They expire after `SHARE_TTL_DAYS` and can be revoked. View tracking hashes IPs with `SHARE_IP_SALT`.
- **Attorney mutations** need a JSON body and a same-origin request, and request bodies are size-capped.
- **Document downloads** only follow hosts on an allowlist (Clio plus `CLIO_DOWNLOAD_HOSTS`).

Local storage, all gitignored under `data/`:

- `data/app.db` (SQLite) holds the Clio record snapshot, change events, PDF text, AI extraction cache, digests, sync runs, OAuth tokens, shares, share views and responses, view state, and the AI cost log. The schema is in `src/lib/db/schema.sql` and is created on first run.
- `data/docs/` caches downloaded PDFs, one file per document version.

## AI models and cost

Measured on the Sapini matter (219 Clio records, 31 PDFs, 361 pages):

| Model | Stage | Cost |
|---|---|---|
| `claude-haiku-4-5` | Coverage, case value, liens (3 calls) | ~$0.020 |
| `claude-sonnet-5-5` | Injuries (1 call) | $0.047 |
| `claude-sonnet-5-5` | Brief synthesis (1 call) | $0.080 |
| | **First digest** | **~$0.15** |
| | **Re-open with unchanged Clio data** | **$0.00** |

Every call is logged to the `ai_calls` table. The brief shows "cached · $0.00 this open" or the build cost. See [docs/submission.md](docs/submission.md) for details.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server on `127.0.0.1:3000` |
| `npm run build` / `npm start` | Production build and server |
| `npm test` | Vitest unit tests (digest rules, AI parsing and validation, share filtering and leak tests, API routes, middleware) |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run digest -- <matterId> [--no-sync]` | CLI: sync and digest a matter, print the summary and cost. `--no-sync` builds from what is already in the DB. |

## Environment variables

See `.env.example`.

| Variable | Purpose | Default / example |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude API key | `sk-ant-…` |
| `CLIO_BASE_URL` | Clio region URL | `https://app.clio.com` |
| `CLIO_CLIENT_ID`, `CLIO_CLIENT_SECRET` | Clio OAuth app | |
| `CLIO_REDIRECT_URI` | OAuth callback | `http://127.0.0.1:3000/api/auth/clio/callback` |
| `CLIO_ACCESS_TOKEN`, `CLIO_REFRESH_TOKEN` | Token fallback when OAuth is not used | |
| `CLIO_MATTER_ID` | Default matter for `npm run digest` | |
| `CLIO_DOWNLOAD_HOSTS` | Extra allowed document download hosts (comma-separated) | |
| `CLIO_FIXTURE_DIR` | Read from fixtures instead of Clio | `fixtures/clio` |
| `DATABASE_PATH` | SQLite file | `./data/app.db` |
| `APP_BASE_URL` | Base URL for share links | `http://127.0.0.1:3000` |
| `SHARE_TTL_DAYS` | Share expiry | `7` |
| `SHARE_IP_SALT` | Salt for hashing viewer IPs (set once, random) | |
| `FIRM_NAME` | Shown on the home page and to providers | |
| `MODEL_EXTRACT` | Fact extraction model | `claude-haiku-4-5` |
| `MODEL_SYNTH` | Brief synthesis model | `claude-sonnet-5-5` |
| `MODEL_SCAN` | Injury extraction model | `claude-sonnet-5-5` |

## Known limitations

- **Single user, localhost only.** There is no attorney login. OAuth only connects to Clio.
- **No notifications.** Providers see updates the next time they open their link. Nothing is emailed.
- **No OCR.** Injuries come from the text-layer Bill of Particulars. Scanned PDFs are stored but not indexed.
- **The AI-suggested action lane is empty.** The UI slot exists, but no suggestions are generated yet.
- **Recovery map assumptions.** The 33⅓% fee and the "rule of thirds" client target are editable defaults (`src/lib/digest/recovery.ts`). The payout order is illustrative, not a distribution statement.
- **No Clio per-record links.** The in-app evidence drawer is the source view, plus one "Open in Clio" link to the matter.

## Tech stack

Next.js 15 (App Router, Node runtime), React 19, TypeScript, Tailwind CSS 4, shadcn/ui on Base UI, SQLite (better-sqlite3), pdfjs-dist, zod, Anthropic SDK, Vitest.

## License

Proprietary. Built for the Swans Applied AI Hackathon.
