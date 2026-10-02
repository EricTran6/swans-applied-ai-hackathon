# Implementation Plan v2: Sapini Case Brief + Provider Share

Inputs: `docs/contract.md`, `docs/research/SYNTHESIS.md`, `docs/research/sapini-data-profile.md`, and the five slide-9 story studies in `docs/research/stories/01-05`. Hard stop: **submit by 3:30 PM** (deadline 4:00 PM). Build starts about 10:50 AM (T0), so T+4:40 = 3:30 PM.

## What changed from v1 (driven by the story research)

| v1 assumption | Finding (source) | v2 decision |
|---|---|---|
| Injuries need vision/OCR on scans | Injuries are in the **text layer** of the Bill of Particulars (pleadings doc-07, pp3-8; footer page = absolute page). Scans (15 pp) are the complaint, the letter, the ID and exhibits (02) | Injuries are text-only: Sonnet on the BoP text → `{page, quote}`, validated by substring. **No vision.** Promoted from SHOULD to MUST |
| Chips deep-link into Clio per record | Per-record Clio web URLs are UNVERIFIED; only the matter URL is reliable (02) | **The evidence drawer is the source of truth**: record text with the quote highlighted, plus a PDF viewer at a page via our `/api/documents/:id` proxy. One "Open matter in Clio" link |
| Change feed via `updated_at` | Every `created_at`/`updated_at` is the seed time; the 42 notes have 42 distinct etags (01, 05) | Diff on **etag / content hash** per record against a snapshot in SQLite. Demo: a "Compare since" date picker (filters by record `date`), not a hardcoded date |
| LLM ranks "10 that matter" | Code scoring reproduces a sensible top 10; the 2026-09-15 "Case posture" note is #1 (01) | **Code scores** (recency decay + signal terms + $ amounts + still-open cross-refs); the model writes only the one-line "why" in the same synthesis call |
| Waiting-on-others is AI-flagged | It can be deterministic: open task whose assignee or name points to a contact, plus an outbound comm to that contact with no later reply (03) | Rule in code; AI "ball-in-court" label is SHOULD |
| Case value KPI from the custom field | Value $375k vs **$100k** effective coverage (UM/UIM $25k adds $0; no-fault exhausted); Medicaid lien $22,180; firm costs $1,410; carrier field says SELF-INSURED but the 09-08/09-09 sources confirm $100k (03) | **Value-vs-coverage bar + waterfall** (cap → minus lien → minus costs → before fees). Latest-dated source wins, with a "conflicting sources" popover (SHOULD) |
| Firm spend = sum of expenses | 9 provider-bill rows have `total=null` and the amount in `non_billable_total` (= $118,400 specials) (03) | Split by **shape**, not by the string "DEMO": firm spend $1,410 (5 rows); provider bills feed the specials and the provider view |
| Last client contact = comms sent by the client | Client-initiated calls are logged with sender = firm user (03) | Client as sender **or** receiver; phone weighs as a conversation. Result: call 2026-09-27, 5 days ago |
| Share filtered by keyword | Keyword fallback misses the credibility notes and flags a provider's own bill (04) | **Notes are default-deny** for providers. Updates are templated sentences from structured events. Folder rules classify documents. AI/keywords can only downgrade. Fail closed |
| Providers see all records | The nine bills sum to the specials, so cross-provider visibility leaks valuation (04) | **Per-provider scoping**: own bills/records/tasks by default; other providers' records opt-in per item |
| Provider sees coverage limits | $100k limit vs $118k specials exposes a shortfall (05) | Coverage chip "Liability coverage confirmed in writing (date)" with **no dollars by default**; limits behind an attorney toggle |

## Story → feature map (slide 9)

Attorney (A) and Provider (P). Priority: M = MUST, S = SHOULD, C = CUT.

| # | Story | Feature | Data | AI? | Pri |
|---|---|---|---|---|---|
| A1 | Up to speed without asking | Header + 4-sentence cited brief + KPI row | all; brief seeded with the 09-15 posture note | Sonnet, cached | M |
| A2 | What changed since I last opened | "Since last open" pill + filtered feed; "Compare since" picker | etag snapshot in `item_events`/`view_state` | none | M |
| A3 | 10 that matter out of 300 | Top-10 cards "10 of N" | code score over notes/comms/tasks/calendar/docs | "why" line only | M |
| A4 | 2 minutes vs everything | Depth toggle: brief ↔ full sortable timeline (all items, each opens source) | items table | none | M |
| A5 | Date → where it came from | Every date/number is a chip → drawer with source, date, quote highlighted | `SourceRef` + validator | none | M |
| A6 | Click anything → open its source | Evidence drawer (note/comm/task/calendar text, PDF at page) + "Open matter in Clio" | cached record + `/api/documents/:id` | none | M |
| A7 | Client's picture | Initials avatar + profile card (age, last contact, treating status, next visit). `avatar` is null; never show photo-id.pdf | contact | none | M |
| A8 | Injuries in a 200-page scan | Injury cards grouped by body part, status badge, "BoP p3" chip opens the PDF at that page | BoP text layer | Sonnet, cached by doc version | M |
| A9 | Last talked to the client | KPI chip "Last spoke 5 days ago (call)" + source | comms where client is sender/receiver; notes | none | M |
| A10 | Don't re-digest on every open | Digest keyed by input-set hash; "cached · $0.00 this open" badge; per-call cost log | `ai_calls` | n/a | M |
| A11 | Overdue / coming / waiting | Action board: overdue, next 30 days, waiting-on (who + days silent + request count); SOL shows as a "satisfied" chip, never overdue | tasks, calendar, comms | S: ball-in-court label | M |
| A12 | Worth + coverage | Value-vs-coverage range bar + waterfall | custom fields + latest-dated quoted notes | Haiku extracts limit/lien numbers with a verified quote; math in code | M |
| A13 | Firm spend | $1,410 tile; S: category split | expenses by shape | none | M |
| A14 | What did we share; opened? | Share history + "Opened 2x, last 10:42" pill | `shares`, `share_views` | none | M |
| A15 | Doctors see status, not the file | Provider page (below) | snapshot | none | M |
| A16 | Adjust before sending | Builder: checklist by category, live "what X will see" preview, sticky "N shared / M withheld" | candidates | S: Haiku flags (downgrade only) | M |
| A17 | Secure sharing | Random token, sha256 at rest, expiry, revoke → 404, frozen snapshot, view POST after render, no-store, no PHI in logs | | none | M |
| P1 | Coverage behind the case? | Coverage chip, no dollars by default | latest coverage source | none | M |
| P2 | Is the case alive? | Status rail: Open · In litigation · last firm activity · next event | matter, calendar, comms | none | M |
| P3 | Tell me when it moves | "Since your last visit" on the share page (projection hash diff). Email = stored preference only | snapshots | none | S |
| P4 | Treating with one eye closed | Care team + diagnoses/procedures from BoP with page refs (no expert reports, no notes); gated on HIPAA field = true | BoP, relationships | reuses A8 | S |
| P5 | What does the firm need from me | "What we need from you" checklist from tasks matching this provider (contact name/relationship), templated provider-safe text, due date | tasks + relationships | S: Haiku rewrite | M |
| P6 | Is my patient still showing up? | Upcoming "Client treatment" calendar entries; honest gap note ("no visit records from you on file after <date>"). Never claim the patient stopped | calendar, documents | none | S |
| P+ | (their money) | "Bill on file: $X, services through <date>, updated ledger requested" (stale flag). Never "lien confirmed"; other providers' bills, the Medicaid lien and total specials are hidden | provider-bill expense rows | none | M |

Cut entirely: Clio per-record deep links, vision on scans, body-map graphic, webhooks/email sending, provider uploads/logins, cross-provider AI clinical summary, settlement calculator/fee scenarios, AI-only "suggested" lane.

## No-hardcoding guardrails (rule 1, judges grep)

- Matter id comes from the URL/CLI only. No Sapini names, ids, dollar amounts, dates or provider names in `src/`.
- Scoring signal terms, folder→category rules, and the share preset are generic PI vocabulary (e.g. `settle|offer|demand|lien|strategy`), not case facts.
- The provider-task match uses the relationship contact name and the role `description`. A task-name prefix like "By medical provider:" is only a fallback pattern, documented as a convention.
- "Compare since" is a user control; no seeded dates in code.
- Phase 4 grep: `grep -rniE "sapini|1811202578|justin|375,?000|capiola|sportscare" src/` must return nothing.

## Contract deltas (lead applies to `docs/contract.md` + `src/lib/types.ts` before fan-out)

1. `SourceRef.clioUrl` → optional; add `drawerKey: string` (`"note:123"`, `"document:55#p3"`). The UI opens the drawer, and the matter URL is in the header.
2. `Kpi` add `conflicts?: SourceRef[]` (other sources that disagree; latest-dated wins).
3. `Digest.valueWaterfall: { label: string; amount: number; refs: SourceRef[] }[]` (computed in `kpis.ts`).
4. `ActionItem` add `waitingOn?: { name: string; kind: 'provider'|'client'|'adverse'|'other'; requests: number; daysSilent: number }`; drop the `suggested` lane from MUST.
5. `RankedItem` add `score: number`; ranking is code.
6. `Injury.refs` must include ≥1 document page ref; add `status: 'surgery-done'|'surgery-recommended'|'diagnosed'`.
7. `ShareCandidate` add `providerContactId`; `ProviderView` add `bill: { amount: number; servicesThrough: string | null; stale: boolean } | null`, `needs: { text: string; due: string | null }[]`, `careTeam?`, `findings?` (S). The dollar rule in s9 becomes "no dollar figures except this provider's own bill, and coverage limits only if toggled".
8. `ItemRow.contentHash` = sha1 of the normalized projected fields (or etag), never `updated_at`.

## Phases

### Phase 0: Scaffold (lead, solo) T+0:00 to T+0:30
As in v1: Next.js (TS, Tailwind, App Router, `src/`), deps (`@anthropic-ai/sdk better-sqlite3 date-fns lucide-react zod pdfjs-dist`, dev `vitest tsx`), shadcn components, scripts (`dev`, `typecheck`, `test`, `digest`), `types.ts` with the contract deltas above, `schema.sql`, `.env.example`, fixtures (fake client) for UI work, and a smoke test of the Sonnet 5.5 JSON-schema request shape. Commit.

Verify: `npm run typecheck && npm run build`.

### Phase 1: Core fan-out (4 agents, worktree each) T+0:30 to T+2:00

| Stream | Owned paths | Deliverable | Verify |
|---|---|---|---|
| A clio + ingest | `src/lib/clio/**`, `src/lib/ingest/**` | GET-only client (throws on non-GET), paging, rate limits, normalizers (html.unescape; expense split by shape; contact roles from relationships), fixture mode from `.cache/clio`, `syncMatter()` writing items + item_events by content hash | `npm test -- clio ingest`; per-type counts match the profile (42/69/14/17/14/31) |
| B digest core (code) | `src/lib/digest/{kpis,actions,rank,contact,changes,validator}.ts` + tests | KPIs (value, coverage, waterfall, firm spend, last contact), action board incl. waiting-on rule and SOL-satisfied, top-10 scorer, change diff, validator. **TDD here** (core logic per CLAUDE.md) | `npm test -- digest` RED→GREEN on fixture items that mirror the profile's shapes |
| C ai + share backend | `src/lib/ai/**`, `src/lib/share/**`, `src/lib/db/**`, `src/app/api/**`, `scripts/build-digest.ts` | One Sonnet synthesis call (brief + top-10 whys + open questions, `LlmRef`), Haiku number extraction (limits/lien with quote), BoP injuries pass (text, page refs), cost log; DB repos; all routes incl. `/api/documents/:id` (stream cached PDF); share: candidates per provider, preset + folder rules + fail-closed, token/hash/expiry/revoke, frozen `ProviderView`, view POST | `npm test -- share db`; `npm run digest -- <matterId>` prints digest + cost |
| D attorney UI | `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/matters/[matterId]/page.tsx`, `src/components/brief/**`, `src/components/evidence/**` | Header + profile card, KPI row + value/coverage bar, brief with chips, top-10, action board, depth toggle → full timeline table, evidence drawer (text highlight + pdf.js at page), since-last-open pill + "Compare since" | `npm run typecheck`; renders the fixture digest at 1440 and 390 wide |

Rules: agents never edit `package.json`, `types.ts`, `components/ui/**` or each other's paths. If a contract change is needed, stop and report. Reports ≤10 lines. Merge order: B, A, C, D.

### Phase 2: Integrate on live Sapini (lead) T+2:00 to T+2:40
1. Merge one at a time; `npm run typecheck && npm test` after each.
2. Live `syncMatter` on Sapini, then `POST /api/digest/refresh`. Record cost from `ai_calls`.
3. Spot-check against the research numbers (they are test oracles, not code): firm spend $1,410; 2 overdue; last contact 2026-09-27; cap $100k; the BoP p3 chip opens the left-shoulder sentence.
4. Second open = 0 AI calls.

Verify: `npm run build && npm test`; `droppedRefs` small; `costUsd` set.

### Phase 3: Provider side + SHOULDs (3 agents) T+2:40 to T+3:40

| Stream | Owned paths | Deliverable | Verify |
|---|---|---|---|
| E share builder + provider page | `src/app/matters/[matterId]/share/**`, `src/app/s/[token]/**`, `src/components/share/**` | Provider picker, category checklist with hard-deny locks, live preview, counter, send/copy link, opened pill, revoke. Provider page (mobile-first): status rail, coverage chip, "what we need", bill card with stale flag, upcoming treatment, since-your-last-visit (S) | Create a share, open it in a private window on a phone width, attorney sees "opened 1x"; revoked → 404; grep the rendered HTML for `$375`/`Medicaid` returns nothing |
| F AI flags + polish | `src/lib/ai/flags.ts`, `src/components/brief/**` (after D is merged) | Haiku share flags (downgrade only) + provider-safe task rewrite; conflicts popover; ball-in-court label; skeleton/empty/error states | Unit test: a flag can never raise inclusion |
| G care team (S) | `src/components/share/care-team/**` | P4 findings from the injuries digest, gated on the HIPAA field, opt-in toggle | Shows only BoP/treating-record refs |

### Phase 4: Review + security (lead + 2 reviewers) T+3:40 to T+4:10
`ecc:typescript-reviewer` + `ecc:security-reviewer` in parallel (share leaks, token handling, GET-only, the documents route can't serve outside the matter, no PHI/secrets in logs). Fix CRITICAL/HIGH only. README run steps. Hardcoding grep. Pre-warm the digest.

### Phase 5: Demo + submission (lead) T+4:10 to T+4:40
90s clip on Sapini:
1. 0:00-0:20: Open → "Justin, last spoke 5 days ago", $375k worth vs $100k coverage bar, 2 overdue, "second surgery undated after 5 asks".
2. 0:20-0:40: Click "Left labral tear · BoP p3" → PDF opens at p3 with the sworn sentence highlighted. Flip the depth toggle → all N items.
3. 0:40-0:50: "Since Sept 1": coverage confirmed, IME reports, posture note. "Cached · $0.00 this open."
4. 0:50-1:15: Share builder for SportsCare: "N shared / M withheld", valuation + Medicaid locked, AI flags a task, send.
5. 1:15-1:30: Phone view: in litigation, coverage confirmed, "send treatment notes since Dec 2023", stale bill flag → attorney sees "opened".

`docs/submission.md`: stack, models (Sonnet 5.5 synthesis + BoP; Haiku 4.5 extraction/flags), measured cost (estimate ≈ $0.15-0.30 first digest, $0 re-open), read-only guarantee, limits (scans not OCR'd, Clio per-record links not used, email notify stubbed). Submit by **3:30 PM**; backup recording by 3:15.

## Cut-line (cut in this order when a phase runs >15 min over)
1. G care team (P4) → mention as "next".
2. AI share flags + task rewrite → keyword/folder rules only (still downgrade-only).
3. Since-your-last-visit on the provider page (P3).
4. Conflicts popover, ball-in-court label.
5. pdf.js highlight → plain `<iframe src=...#page=N>`.
6. Full timeline polish → plain sortable table.

Never cut: source chips + validator + drawer, cached digest + cost, value/coverage bar, action board, injuries from BoP, share send/view/opened/revoke with per-provider scoping, the live Sapini run.

## Risks (deltas from v1; v1 risks still apply)

| Risk | Sev | Mitigation |
|---|---|---|
| Hardcoding accusations (rule 2) because the research numbers are so specific | HIGH | Numbers live only in research docs and tests' fixtures; Phase 4 grep; README says how each panel is computed |
| Leak via provider page (valuation, Medicaid, other bills, note text) | HIGH | Notes default-deny; `ProviderView` type has no free text from notes; render-level grep test; security review |
| Change feed looks empty on the demo (seed data has one timestamp) | MED | "Compare since" picker over record `date`; etag snapshot shows real diffs after a re-sync |
| BoP all-caps text with hard line breaks breaks quote matching | MED | Normalizer collapses whitespace + case; unit test with a real BoP line pattern (synthetic text) |
| Clio rate limit / outage during the demo | HIGH | Page never calls Clio; digest cached; backup video |

**WAITING FOR CONFIRMATION**: proceed with v2? (yes / modify / cut more)
