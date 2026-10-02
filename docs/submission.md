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

Measured on the Sapini matter (219 Clio records, 31 PDFs / 361 pages), 2026-10-02, digest v6:

| Model | Stage | Calls | Measured cost |
|---|---|---|---|
| `claude-haiku-4-5` | Extract coverage layers, case value, liens from custom fields + notes (validated quotes) | 3 | ~$0.020 |
| `claude-sonnet-5-5` | Injuries from the Bill of Particulars text layer (page-cited) | 1 | $0.047 |
| `claude-sonnet-5-5` | Brief, top-10 "why" lines, open questions, client status chips | 1 | $0.080 |
| **First digest (cold)** | | 5 | **$0.147** |
| **Re-open / unchanged Clio data** | cached by input-set hash | 0 | **$0.00** |

**Approximate cost per case: ~$0.15 for the first digest, $0 for every later open.** Incremental refreshes only re-run stages whose inputs changed (per-record and per-document-version caches). Every call is logged to the `ai_calls` table with tokens and USD.

**No AI on**: KPIs (code), action board (code), top-10 scoring (code), change diff (code), validator (code). Cost is synthesis + extraction only.

### Cost Breakdown Strategy

1. Every AI call is logged in `ai_calls` table: model, input/output tokens, USD cost
2. First digest cost calculated from token usage × pricing table in `src/lib/ai/index.ts`
3. Cached digest (same `inputSetHash`) = zero calls, $0.00 this open
4. `GET /api/case` response includes `{ ...costUsd }` and a badge on the brief: "cached · $0.00 this open" or "built for $X.XX"

## 5. Differentiators & What We're Proud Of

### What sets it apart: who gets paid
- A "Who gets paid" recovery map on the attorney brief: settlement slider capped at the live coverage limit; splits each dollar across attorney fee, firm costs, liens, each treating provider's bill, and the client; every input links to its Clio source.
- Flags when a case is underwater (bills + liens + fee exceed available coverage) and computes the uniform provider reduction needed for the client to net a target. Answers the slide-5 point that liens are negotiated down at the end.
- Pure, unit-tested code (`src/lib/digest/recovery.ts`), no AI, $0 per open. Attorney-only; never included in a provider share.

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

### Hardcoding in the Repo

1. **`scripts/clio_dump.py`**: Previously hardcoded specific matter and client IDs for the test case. Fix applied: now reads from `CLIO_MATTER_ID` env var. Use `CLIO_MATTER_ID=<id> python3 scripts/clio_dump.py` to fetch any matter.

2. **No hardcoded case data in `src/`**: All logic is generic (signal terms, coverage layers, task assignment rules). Matter IDs come from URLs or CLI args; provider names and case values are fetched from Clio.

3. **Recovery map defaults**: Attorney fee 33⅓% and client target "rule of thirds" (1/3 of settlement) are generic, editable assumptions (`DEFAULT_FEE_PCT`, `DEFAULT_CLIENT_TARGET_SHARE` in `src/lib/digest/recovery.ts`), not case data; Clio has no fee field. Payout order (liens before providers, providers pro rata) is illustrative, not a distribution statement.

### Half-Done Features (Would Complete if Time Allowed)

1. **Ball-in-court label** on action board: AI-suggested label for tasks. Scoring rule in place; UI label not rendered.

2. **AI-suggested action lane** is empty: the "Suggested (AI)" lane renders only when suggestions exist, and none are generated yet.

## Next Steps if Continuing

- [ ] Generate AI-suggested actions for the action board
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
- [x] Dev-only routes deleted from `src/app/dev/` before final push
