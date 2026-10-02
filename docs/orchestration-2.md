# Orchestration batch 2: polish from the live-matter review (execute this file)

Written from screenshots of `/matters/[id]` and two share-builder exports, checked against the DB and code at local `main` `d0576e8`. At that point local `main` was 14 commits ahead of `origin/main`, and a second session had 14 uncommitted files in `src/app/api/**`, `src/lib/db/repos.ts`, `src/lib/server/http.ts` and `src/lib/share/**`.
Repo: `github.com/EricTran6/swans-applied-ai-hackathon`, base `main`. Hard stop: all branches pushed by **2:15 PM PT**. The lead merges locally and submits by 3:30 PM.

## Step 0: lead, local, before any agent launches (blocking)

1. Stop the other local session, or wait until it is idle. Commit its work (`src/app/api/**`, `src/lib/share/**`, `src/lib/db/repos.ts`, `src/lib/server/http.ts`). Cloud agents only see `origin/main`.
2. Run `npm run typecheck && npm test && npm run build`, then `git push origin main`.
3. Rebuild the live digest without re-syncing: `npm run digest -- --no-sync` (the matter id comes from `CLIO_MATTER_ID`). The screenshots show **digest v1**, built before the API key existed. That build is what produced the auth-error banner, the empty brief, the missing "why" lines and the empty injuries panel. v3 already fixes those ($0.14, 20 injuries, no warnings). v3 still has **coverage empty and the waterfall empty**, even though the brief cites the limits. The facts-v3 extractor (19:11, after v3 was built) does return the BI and UM/UIM layers, so a rebuild should fill them in. **Check after the rebuild:** the coverage KPI shows the BI cap, the range bar has its cap marker, and the waterfall renders. If not, that becomes task R1's first item.
4. Decision for the lead: the uncommitted `src/lib/share/candidates.ts` change limits findings to documents of folder kind `record`. Injuries come from the bill of particulars, which is a pleading, so the provider "Findings" section can no longer appear at all. (The Peter Kwan export has no Findings; the SportsCare export, made before the change, has them.) Either accept that (provider never sees pleading-derived findings) or allow BoP page refs. Tell R5 which way to go.

## Instructions for the orchestrator

1. Do not edit code yourself. Launch every task below **in one message**, in parallel. R6 runs after merges, not in this wave.
2. `model` = the task's Model. If a `fable` launch fails on credits or a 429, relaunch it once with `opus` and note that. Use `isolation: "worktree"` (or `"remote"`).
3. Agent prompt = **Common preamble** + that task's brief, verbatim.
4. Final message: a `task | branch | status | blockers` table. Do not merge into `main`.

## Common preamble (prepend to every agent prompt)

> You are a build agent fixing issues found in a live review of a hackathon demo. Repo: github.com/EricTran6/swans-applied-ai-hackathon. Start from `main`.
> Read first: `CLAUDE.md`, `docs/contract.md`, `src/lib/types.ts` (authoritative), `docs/agent-brief.md`, then your brief below.
> Hard rules (breaking them disqualifies the team):
> 1. Clio is READ-ONLY. Never write to Clio.
> 2. No hardcoded case data in `src/` or `scripts/`. That means no client or provider names, matter ids, amounts or dates from the real case. The examples in your brief describe what the live matter showed; turn each one into a generic rule and test it with the synthetic `fixtures/` ("Jane Doe").
> 3. You have no `.env`, no Clio access and no API key. Mock the Anthropic SDK and Clio in tests.
> 4. Edit ONLY your owned paths. Do not edit `package.json`, the lockfile, `tsconfig.json`, `next.config.ts`, `src/lib/types.ts` or `src/components/ui/**`. If you need a type or contract change, stop and report it.
> Workflow: `npm ci`; tests first for logic (RED → GREEN); UI is verified by unit tests on pure helpers (layout math, aggregation, formatting) plus `npm run build`. Do **not** create `src/app/dev/**`: dev preview routes were removed before submission. The lead checks visuals locally in R6. self-review as the listed reviewers. At most 3 fix iterations on a failing verify, then report the blocker.
> Done = your Verify commands pass, work is committed on `task/<id>-<slug>` and pushed (`git push -u origin task/<id>-<slug>`). Never push to `main`. Use conventional commit messages.
> Final report, 10 lines max: branch, verify status, files touched, contract changes needed, blockers.

## Overview

| ID | Task | Model | Why this model | Owned paths |
|---|---|---|---|---|
| R1 | Digest logic quality | opus | ranking, threading and waiting-on rules; judged on correctness | `src/lib/digest/**` |
| R2 | Brief header, KPIs, banners, design tokens | sonnet | UI fixes with a clear spec | `src/components/brief/{Header,KpiRow,BriefView,BriefPanels,primitives}.tsx`, new `src/components/brief/header-lib.ts`, `src/app/globals.css` |
| R3 | Story strip and list layout | sonnet | layout math plus UI | `src/components/brief/{StoryStrip,TopTenAndActions,InjuriesAndTable}.tsx`, `src/components/brief/lib.ts` (+ its test) |
| R4 | Share builder: real preview, less noise | opus | demo centerpiece for audience 2; new route | `src/components/share/builder/**`, `src/app/matters/[matterId]/share/**`, new `src/app/api/share/preview/route.ts` (+ test) |
| R5 | Share lib fail-closed cleanup | fable | leak safety; security-sensitive | `src/lib/share/**` |
| R8 | Landing page: matter dashboard | opus | first screen judges see; new route + UI | `src/app/page.tsx`, new `src/components/home/**`, `src/components/brief/MatterList.tsx` (may be deleted once replaced), new `src/app/api/matters/overview/route.ts` (+ test) |
| R7 | ~~Submission cost and limits~~ DONE on main (`6abeae4`); do not launch | — | — | `docs/submission.md`, `README.md` |
| R6 | QA sweep (after merges, local) | sonnet | read-only browser pass | none (report only) |

Paths do not overlap. R2 must not touch `lib.ts`; put any new helper in `header-lib.ts`. R2 also owns `src/app/globals.css` (design tokens). R3 and R4 use the tokens and never add raw hex colors.

## UI design direction (R2, R3, R4, R8: add this block to their prompts)

> Load the `ecc:frontend-design-direction`, `ecc:frontend-patterns` and `ecc:frontend-a11y` skills before you edit anything. This is a **refinement pass, not a redesign**. Keep the existing language: warm off-white page, white cards, navy primary, serif section titles, monospace dates. Change nothing that the demo clip already depends on, such as the section order or what each panel shows.
> - **Hierarchy**: one dominant number per KPI card; labels in small caps at 12 px; body text 14–15 px; at most 3 text weights per card. Red only for overdue or late, amber for "review", blue for "waiting on", green for "ok/satisfied". Every status color also carries an icon or a word, never color alone.
> - **Density**: consistent 16/24 px spacing inside and between cards; source chips sit after their fact, are 22 px tall and wrap as a group; truncate long titles to 2 lines with the full text in `title`.
> - **Accessibility**: WCAG 2.2 AA contrast (the grey meta text in the screenshots is borderline; check it), visible focus rings on chips, dots and toggles, keyboard access to every strip dot and hover card, `aria-expanded` on every collapsible, and `prefers-reduced-motion` respected.
> - Don't use `/ecc:multi-frontend`: CLAUDE.md bans the `multi-*` commands, and it needs an external runtime that we don't have.

---

## R1: Digest logic quality  (branch `task/r1-digest-quality`)
- **Goal**: the strip, the top ten, the action board and the Everything table tell a correct, uncluttered story.
- **What the live matter showed** (examples only; never encode them):
  1. **27 of 160 timeline events were milestones.** They included client check-in calls, "IME notice" letters, "Compliance conference: proposed dates", "Call to the client ahead of the conference" and a status note title. A milestone should be the event itself: the incident, retention, a surgery performed or recommended, suit filed, coverage confirmed, an IME attended, a conference or trial held. Communications *about* an event are not milestones. Collapse the same milestone kind within 14 days to the earliest entry, and cap milestones at 12, keeping the highest-priority kinds.
  2. **Timeline categories were wrong.** "Call to <orthopaedic practice> re right shoulder surgical date" was filed as money, "Client appointment: updated employment and commission records" as legal, "File review: compliance conference …" as treatment, "Obtain updated employment and commission records" as medical, and "RE: Chaser: …" as other while "Chaser: …" was medical. Fix: strip `RE:/FW:/Fwd:` before classifying; use an ordered rule list in which the first match wins (court/conference/deposition/discovery → legal; employment/wage/commission/ledger/bill/invoice/lien → money; surgery/surgical/therapy/treatment/MRI → treatment); never let a word inside a provider's name decide the category.
  3. **Document events showed raw filenames** such as `08-experts__doc-47__radiology-review-katzman.pdf`. Humanize them: drop the extension, numeric prefixes and `doc-N` segments, turn `_`/`-` into spaces and use sentence case ("Radiology review katzman"). A copy exists as `humanizeFilename` in `src/lib/share/templates.ts`; write a digest-local helper rather than importing from share.
  4. **The top ten held near-duplicate threads**: "Coverage confirmed in writing" next to "RE: Coverage confirmation …", and "Chaser: …" next to "RE: Chaser: …". Group by thread (the subject after stripping `RE:/FW:`, plus the same counterparty) and keep the highest-scored item per thread, so the top ten covers ten different topics.
  5. **Waiting on.** In v1, a provider whose last reply was years ago showed "858d silent · 4 requests", counted across request cycles years apart. v3 shows **no waiting-on items at all**, although a ledger request sent 6 days earlier has had no reply. New rule: the unanswered window starts at the later of (their last reply) and (now − 180 days). `requests` = outbound comms to them inside the window; `daysSilent` = days since the first of those. An item appears when `requests >= 1`. Do not repeat an item under "upcoming" if it is already under waiting-on.
- **Verify**: `npm run typecheck && npm test -- src/lib/digest`. Fixture tests for each rule: no comm is ever a milestone; ≤12 milestones; an `RE:` reply shares its parent's category and thread; a provider name containing a money word does not make the event money; filename humanizing; one entry per thread in the top ten; an old answered request cycle does not count toward waiting-on; a fresh unanswered request does. The existing fixture expectations (firm spend, specials, overdue, SOL satisfied) still pass.
- **Chain**: `ecc:tdd-guide,ecc:typescript-reviewer`

## R2: Brief header, KPIs, banners  (branch `task/r2-brief-header`)
- **Goal**: the top of the page reads cleanly in 10 seconds and never shows raw errors or contradictory status.
- **Fixes**:
  1. "Last synced never" appeared above a fully built digest. When there is no sync run, fall back to "Built <relative time>" from `meta.builtAt`.
  2. The "AI cost $0.00" badge contradicts `meta.costUsd`. Show "This open: $0.00 (cached) · built for $X.XX".
  3. The warnings banner dumped six copies of the same API error. Group warnings by stage, show one line ("AI step failed: facts, injuries ×5, synthesis"), put the details in a disclosure, and add a Refresh call to action. Strip API error JSON from the visible text.
  4. Inline source chips break the header text. Example: "Matter · 2023-05-07 +1 DOI Apr 23, 2023", where the "+1" overflow dangles between facts. Put each fact's label before its chips, keep the overflow count attached to its chip group, and let chip rows wrap as a unit.
  5. The footer listed models with duplicates ("claude-sonnet-5-5, claude-sonnet-5-5"). Dedupe them and show the pipeline version once.
  6. Coverage and value: once coverage exists, the range bar must draw the cap marker and the shaded gap. When coverage is unknown, label the bar "cap unknown" rather than leaving it bare. The waterfall's empty state should name the missing input ("needs coverage limits").
- **Verify**: `npm run typecheck && npm test -- src/components/brief && npm run build`. Add unit tests in `header-lib.ts` for warning grouping and the synced/built label.
- **Chain**: `ecc:tdd-guide,ecc:typescript-reviewer`

## R3: Story strip and list layout  (branch `task/r3-strip-layout`)
- **Goal**: the strip is readable with 12 milestones clustered in the last year, and the two-column section is balanced.
- **Fixes**:
  0. **Stretch the strip across the page.** Today it is a fixed `viewBox` scaled into the 1360 px column (`min-w-[720px]`), so a wider strip only scales the text up. Instead: make the strip card full-bleed (break out of the `max-w-[1360px]` container to the viewport width, minus a 24 px gutter). Do this inside `StoryStrip.tsx` (for example `relative left-1/2 w-[calc(100vw-48px)] -translate-x-1/2`); `BriefView.tsx` belongs to R2, so don't edit it. measure its real width with a `ResizeObserver`, and pass that width to `stripLayout` so labels are placed in real pixels at a constant font size. Use a gap-compressed time scale: any empty stretch longer than 120 days takes at most 8% of the width and is drawn as a break mark (`//`), so dense recent months get the room. Make it taller (up to 3 label rows above the axis and 2 below). At 390 px, keep a horizontal scroll with the newest end in view first.
  1. Strip labels overlapped into unreadable stacks ("Jul 12, 2023 Aug 1, 2023" drawn on top of each other). Commit `1de5a5d` started a collision fix; finish it. Assign labels greedily to up to 3 rows; when a label still collides, drop its text and show it in a hover or focus tooltip on the dot. Never draw overlapping text. Merge dots that sit closer than 8px into one cluster dot with a count badge. "Today" must not cover a label.
  2. The left column had large empty space under "10 that matter" while the action board ran three screens long. Show the first 5 upcoming items and a "+N more" toggle; keep overdue and waiting-on fully expanded; make both columns `items-start`.
  3. In the Everything table, a stray "·" followed every date. Remove it, and show humanized document titles (R1 supplies them in the data).
  4. Injuries: 20 injuries across 10 body parts must render compactly, grouped by body part, with status badges and page chips, and without one long column.
- **Verify**: `npm run typecheck && npm test -- src/components/brief && npm run build`. Test the strip layout: no two label boxes intersect for 12 dense milestones at widths 1280, 1920 and 2560; clustering under 8px; the gap-compressed scale is monotonic and caps empty stretches at 8%.
- **Chain**: `ecc:tdd-guide,ecc:typescript-reviewer`

## R4: Share builder, real preview and less noise  (branch `task/r4-share-builder`)
- **Goal**: an attorney picks a provider, sees exactly what that provider will see, and is not scrolling past 200 locked rows.
- **What the exports showed**: 241 candidates for one provider. More than 150 of them were locked notes, communications, calendar entries, tasks and other providers' bills, each rendered as its own row. The "What X will see" preview printed the item *descriptions* ("Active / stalled, last firm activity date, next event date", "Coarse stage label (treating, …)", "Your records (name and date only)") instead of real values. "Request sent to your office" appeared five times with no dates.
- **Fixes**:
  1. **Real preview.** Add `POST /api/share/preview` with the same body and the same zod validation as the create route (`matterId`, `recipientContactId`, `includedIds`, `attorneyNote`, `coverageLimits`). It calls `buildProviderView` from `src/lib/share` and returns `ProviderView`. It has no persistence, no token and `Cache-Control: no-store`. Render the result with `ProviderViewCard` from `src/components/share/provider` and refresh it on each change, debounced at 300 ms. Delete the description-based preview.
  2. **Collapse what can't be shared.** Each fully locked category becomes one row ("Attorney notes · 47 items · never shared") that you can expand for audit. Categories that are not in `DEFAULT_PRESET.allow ∪ optIn` (liability, firm expenses, client personal info) currently render as unexplained grey checkboxes. Treat them as locked with the reason "Not shared with providers", fail closed in `logic.ts`.
  3. **Scope to the recipient.** In Appointments, Requests and Updates, show the selected provider's items. Fold other providers' disabled items into a collapsed "Other providers (N), not shared" line. Hide completed requests (count them as withheld).
  4. **Provider picker.** The selected provider was rendered greyed out, so it looked disabled. Make the selected state filled and add a check icon.
  5. Confirm that checked checkboxes visibly render as checked (checked items looked empty in the export), and that "Send to X" is enabled when `shared > 0` and no link exists yet.
- **Verify**: `npm run typecheck && npm test -- src/components/share/builder src/app/api/share/preview && npm run build`. Tests: the preview route rejects a bad body and returns a view built from mocked lib calls; a locked or non-preset category can never be toggled on; the counter math still holds; collapsed groups count correctly.
- **Chain**: `ecc:tdd-guide,ecc:typescript-reviewer,ecc:security-reviewer`

## R5: Share lib fail-closed cleanup  (branch `task/r5-share-lib`)
- **Goal**: the server-side view stays leak-proof, and its text reads like a status update, not a database dump. Start only after Step 0 has pushed the in-flight `src/lib/share` changes.
- **Fixes**:
  1. A care-team role was truncated at a comma: "physiatry (Vadim Abramov, M.D.)" became "(M.D.))". Fix `roleLabel` in `scope.ts` so it keeps balanced parentheses, never splits inside them, and caps the label at 60 characters.
  2. Updates for the recipient carry their date in the text ("Records request sent Jul 4, 2023", "Your records received Dec 17, 2023"), not a bare "Request sent to your office". Show only the 5 newest per-provider updates plus the stage and coverage updates.
  3. "Field: Accident Location" and "Field: Claim Number" were listed under internal communications. Bucket matter custom fields by name into `client_pii` (incident, location, claim, DOB, wage, prior injury) or `liability` (liability, fault); unknown → excluded.
  4. Firm expense candidates were labeled only "Firm expense / Firm case expense". Give them description + date for audit (they stay non-shareable).
  5. Leak test: for every fixture provider, pass **all** candidate ids as `includedIds` and assert that the serialized `ProviderView` still contains no valuation, liability, firm-expense, client-PII field values, note text, or other provider's bill. This proves the server ignores non-preset categories even if the UI is bypassed.
  6. Findings source: follow the lead's Step 0.4 decision and add a test pinning it.
- **Verify**: `npm run typecheck && npm test -- src/lib/share`. All existing leak tests stay green.
- **Chain**: `ecc:tdd-guide,ecc:typescript-reviewer,ecc:security-reviewer`

## R8: Landing page, matter dashboard  (branch `task/r8-landing`)
- **Goal**: `/` fills a 1440–2560 px screen with a useful "what needs me today" view across matters, not one narrow card in empty space. It must still look right with a single matter.
- **What it showed**: a title, one tagline, a "Clio connection" text link, and one 480 px matter card inside `max-w-4xl`, with about 80% of the screen blank.
- **Data**: add `GET /api/matters/overview`. It calls `listOpenMatters()` (already cached for 5 min) and, for each matter, reads **only our DB**: the latest digest, the `item_events` count since `view_state.last_opened_at`, and the shares (count, opened count, last viewed, latest provider reply). It makes no Clio call beyond the matter list. Return per matter: `{ matter: MatterSummary, digest: null | { version, builtAt, costUsd, stage, kpis: pick(case_value, coverage, specials, next_deadline, last_client_contact), overdue, upcoming7d, waiting, newSinceOpen, topAttention: up to 3 items from overdue then waiting, each with title, dueAt/daysSilent and drawerKey }, shares: { total, opened, lastViewedAt, latestReply } }`. Define this response type in the route's own module, not in `types.ts`. Errors and 401 behave like `/api/matters`. Never log record text.
- **Layout** (full width, `max-w-[1600px]`, 24 px gutters):
  1. **Top bar**: "Case Lens" wordmark, firm name from `FIRM_NAME` if set, and a Clio connection *status pill* (Connected · green / Not connected → `/connect`) replacing the bare link.
  2. **Today strip**: 4 stat tiles summed across matters (overdue, due in 7 days, waiting on others, provider shares opened). Each tile links to the matter or matters behind it.
  3. **Matter cards grid**: 1 column at 390 px, 2 at ≥1024 px, 3 at ≥1600 px. The single-matter case becomes a wide hero card spanning 2 columns. Each card shows:
     - the existing header (avatar, name, matter number, stage pill) plus a mini stage rail
     - 4 mini KPIs: value vs. coverage mini bar, specials, next deadline (red when overdue), last client contact
     - a "N new since last open" badge
     - up to 3 attention rows
     - footer: "Digest v3 · built 12 min ago · $0.14", or "Not digested yet" with a **Digest now** button (`POST /api/sync`, poll `/api/sync`)
     - actions: **Open brief** and **Share with a provider**
  4. **Provider activity column** (≥1280 px: right rail; below that, stacked): the latest share opens and replies across matters ("<provider> opened · 10:42", "Will send by Oct 9"), or an empty state.
  5. **How it works** (small, static product copy, no case data): Clio, read-only → digested once and cached → every fact cited → curated provider share. Four steps with icons.
- **States**: loading skeletons matching the grid, not connected (a big connect card), no matters, overview error (fall back to the plain matter list).
- **Verify**: `npm run typecheck && npm test -- src/components/home src/app/api/matters && npm run build`. Route test with an in-memory DB and mocked `listOpenMatters`: a matter with no digest returns `digest: null`; counts are correct; there are no Clio calls besides the list. Unit-test the aggregation helpers (today-strip sums, attention ordering).
- **Chain**: `ecc:tdd-guide,ecc:typescript-reviewer,ecc:security-reviewer`

## R7: Submission cost and limits: DONE on main (`6abeae4`), do not launch
- **Goal**: `docs/submission.md` has the measured AI cost and current known limits.
- **Facts to use**: full builds logged $0.178 (v2) and $0.143 (v3) per case. A cached open costs $0.00. Models: `claude-haiku-4-5` (fact extraction), `claude-sonnet-5-5` (injuries from PDFs, synthesis). Report "about $0.15–0.20 per full case digest; $0 on unchanged reopen; re-digest only when Clio content hashes change."
- Update the known limits: scanned pages are not OCR'd; no attorney login (localhost); providers see changes on their next visit (no push); dev routes are removed before submit.
- **Verify**: `test -s docs/submission.md && ! grep -rniE "sapini|1811202578" README.md docs/submission.md`.
- **Chain**: `ecc:doc-updater`

---

## Lead: merge + R6
Merge order: R5, R1, R4, R2, R3, R8. After each merge: `npm run typecheck && npm test && npm run build`. Then `npm run digest -- --no-sync` (R1 changes the digest output, so a rebuild is required).

**R6 QA sweep** (local, sonnet, after merges, read-only). Drive `/` (at 1440, 1920 and 390 px; nothing should look stranded in empty space), `/matters/<id>` (both depth modes), the share builder for two providers, and `/s/<token>` at 1440 and 390 px. Report text overlap, unexplained disabled controls, raw ids or filenames, errors, contradictory status (synced/cost), empty panels, and any provider-view text that names another provider, an amount or a note. Report only; the lead fixes or re-dispatches.

Then: `/ecc:code-review`, `/ecc:security-scan`, confirm no `src/app/dev/` came back, run a hardcoding grep over `src/ scripts/`, record the demo clip.
