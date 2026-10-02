# Case Lens: Submission Form

## 1. Repository

**GitHub**: https://github.com/EricTran6/swans-applied-ai-hackathon

**Branch**: `main` (all work committed by 4:00 PM PT)

## 2. Demo Video

**Link**: TBD (90-second clip uploaded to Google Drive, shared read-only)

**Content**: 
- 0:00–0:20: Open brief; show client name, "$XXXk worth vs $XXXk coverage" bar, 2 overdue items, case posture
- 0:20–0:40: Click an injury chip → PDF opens at the exact page with the quoted text highlighted
- 0:40–0:50: "Since Sept 1" picker → shows only items changed; "cached · $0.00 this open" badge
- 0:50–1:15: Share builder for a provider; show hard-denied categories (valuation, strategy); send; attorney sees "opened" status
- 1:15–1:30: Mobile view: provider sees status, coverage, what you need, their bill with stale flag

## 3. Tech Stack & Data Storage

**Framework**: Next.js 15 (App Router, React 19, TypeScript, Tailwind CSS, shadcn/ui)

**Backend**: Node.js runtime (no Edge Functions)

**Database**: SQLite via better-sqlite3 (`data/app.db`, gitignored)
- Stores: Clio records snapshot, change history, cached digests, AI cost log, OAuth tokens, share metadata
- Schema: `CREATE TABLE IF NOT EXISTS` in `src/lib/db/schema.sql` (no migrations, created on first run)

**PDF processing**: pdfjs-dist (text extraction per page, page-by-page render in browser)

**AI**: Anthropic Claude API (structured JSON output, `output_config.format`)

**Testing**: Vitest (unit tests for digest logic, share filtering, validators)

**Build**: Next.js compiler + TypeScript strict mode

**Clio integration**: GET-only HTTP client with paging, rate-limit awareness, OAuth token refresh

## 4. AI Models & Per-Case Cost

### Models Used

| Model | Task | Tokens (est.) | Per-case cost |
|---|---|---|---|
| `claude-haiku-4-5` | Extract coverage/value/lien facts from notes | 2,000 in / 500 out | ~$0.01 |
| `claude-sonnet-5-5` | Extract injuries from Bill of Particulars (page by page) | 6,000 in / 1,000 out | ~$0.05 |
| `claude-sonnet-5-5` | Synthesize brief, top-10 why-lines, open questions | 15,000 in / 2,000 out | ~$0.15 |
| **Subtotal (first digest)** | — | ~23,000 in / 3,500 out | **~$0.21** |
| **Cached re-opens** | — | 0 | **$0.00** |

**Estimated total per case** (first open): **TBD — measured** (range $0.15–0.30 depending on matter size and BoP page count)

**No AI on**: KPIs (code), action board (code), top-10 scoring (code), change diff (code), validator (code). Cost is synthesis + extraction only.

### Cost Breakdown Strategy

1. Every AI call is logged in `ai_calls` table: model, input/output tokens, USD cost
2. First digest cost calculated from token usage × pricing table in `src/lib/ai/index.ts`
3. Cached digest (same `inputSetHash`) = zero calls, $0.00 this open
4. `GET /api/case` response includes `{ ...costUsd }` and a badge on the brief: "cached · $0.00 this open" or "built for $X.XX"

## 5. Differentiators & What We're Proud Of

### Design Principles
- **Every fact is traceable**: No floating numbers. Click any date, dollar amount, or finding → opens the source note/email/document/PDF with the exact quote highlighted at the page and character level.
- **Cached & efficient**: Digest keyed by content hash (not timestamps); second opens cost zero API calls. Judges can reopen the same matter repeatedly without re-running AI.
- **Fail-closed sharing**: Provider view is built to never leak case strategy, valuation, Medicaid lien, or other providers' confidential information. AI can only downgrade inclusion, not raise it.
- **Deterministic scoring**: Top 10 items ranked by code (recency decay, signal terms, still-open cross-refs); AI only writes the why-line. Reproducible, auditable, no magic.

### Technical
- **GET-only Clio**: A guard in the HTTP client throws on any non-GET method; persistence lives in our SQLite DB.
- **Content-hash diffing**: Change detection based on etag/projected fields, not timestamps (Clio seed data has all the same `updated_at`).
- **No hardcoding**: All matter-specific data comes from the URL or Clio; logic is generic personal-injury rules (signal terms, coverage layers, task assignment logic).
- **PDF pipeline**: Download once per version, extract per-page text, cache locally; render pages in the browser with pdfjs-dist for instant zoom/search.

### UX
- **Two depth levels**: 2-minute brief (KPIs + top 10) vs. full sortable timeline.
- **Evidence drawer**: Side panel showing record text with quote highlighted, PDFs at the exact page. Never leaves the app; one "Open in Clio" link for matter overview.
- **Share builder**: Live preview of what each provider will see; hard-deny items locked with a reason (lock icon). Attorney can toggle coverage limits on per share.
- **Provider mobile view**: Optimized for phone width; status, bill, what you need, upcoming treatment. A footer states what is NOT shared to earn trust.

## 6. Known Limitations & Hardcoded / Half-Done Notes

### Known Limitations (Design Choices)

1. **No attorney login**: The app runs on `localhost:3000` (single-user dev mode). OAuth is for Clio token refresh only, not user authentication.

2. **No push/email alerts**: Providers see changes when they visit their share link (HTTP POST beacon on view). No webhooks or email notifications sent to providers.

3. **Scanned pages (15 pp) not OCR'd**: Injuries come from the text-layer Bill of Particulars (structured pleadings), not from scanned exhibits. Scans (complaint, ID, letter, exhibits) are stored but not indexed.

4. **Clio per-record deep links not used**: The in-app evidence drawer (with highlighted quote and PDF at page) is the source of truth, not per-record Clio web URLs (which are unverified in Clio's API).

5. **Dev-only routes not removed yet**: `src/app/dev/**` (fixture preview pages: `/dev/brief`, `/dev/evidence`, `/dev/share-builder`, `/dev/provider`) will be deleted before final submission. They exist for development and testing only; judges will not see them.

### Hardcoding in the Repo

1. **`scripts/clio_dump.py`**: Previously hardcoded specific matter and client IDs for the test case. Fix applied: now reads from `CLIO_MATTER_ID` env var. Use `CLIO_MATTER_ID=<id> python3 scripts/clio_dump.py` to fetch any matter.

2. **No hardcoded case data in `src/`**: All logic is generic (signal terms, coverage layers, task assignment rules). Matter IDs come from URLs or CLI args; provider names and case values are fetched from Clio.

### Half-Done Features (Would Complete if Time Allowed)

1. **Provider replies** (structure in DB, endpoints in place): UI confirmation screen. Currently stored in `share_responses` table but not displayed in the share history.

2. **Conflicts popover** on KPI value bar: Shows alternate sources when coverage or case value have conflicting recent notes. UI placeholder; code is in place.

3. **Ball-in-court label** on action board: AI-suggested label for tasks. Scoring rule in place; UI label not rendered.

4. **Care team & findings** on provider view: Optional section showing treating providers and findings from injuries (gated on HIPAA field). Database structure in place; UI rendering not implemented.

## Next Steps if Continuing

- [ ] Implement UI for provider replies in share history
- [ ] Add conflicts popover to KPI row
- [ ] Render care team on provider view (if HIPAA field is true)
- [ ] Add "ball-in-court" label to action board waiting-on items
- [ ] Email notification preference in provider profile (not yet connected to actual email)
- [ ] Advanced: user login + multi-user workspace (currently single-user localhost)

## Submission Checklist

- [x] README.md: run instructions, setup, fixtures, architecture, tech stack, read-only guarantee
- [x] docs/submission.md: all 6 form fields (repo, clip link TBD, tech stack, models + cost, differentiators, limitations)
- [x] No hardcoded case data in `src/`
- [x] All code committed to `main` (work branches merged by lead locally)
- [x] `npm run typecheck && npm run build` passes
- [x] Tests pass: `npm test`
- [x] Fixtures work: `CLIO_FIXTURE_DIR=fixtures/clio npm run dev`
- [ ] 90-second demo clip uploaded to Google Drive (TBD)
- [ ] Dev-only routes deleted from `src/app/dev/` before final push
