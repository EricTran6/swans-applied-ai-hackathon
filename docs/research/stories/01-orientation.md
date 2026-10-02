# Stories 1-6: Attorney orientation and recency (Sapini)

Source: `.cache/clio/*.json` snapshot 2026-10-02 (today = 2026-10-02). Counts: 42 notes, 69 comms (56 email/13 phone), 14 tasks (7 pending), 17 calendar entries, 14 expenses, 31 PDFs, 14 relationships.

## Cross-cutting data facts (verified in the dump)

- `created_at`/`updated_at` = 2026-10-02 on EVERY record (seed). Useless for recency. Use business dates: note/comm `date` (plain date), task `due_at`, calendar `start_at`.
- `etag` IS usable for change detection: 42 distinct etags across 42 notes, each a content hash. Matter etag + `updated_at` change on any matter edit. Per-record etag diff = "edited since last view"; new id = "added since last view".
- Notes have no author and no `creator`. Comms have `user` + senders/receivers (names only, no addresses). Notes: unescape HTML (`html.unescape`).
- Note dates span 2023-05-07 to 2026-09-27. Density: 2026 has 26 comms and 13 notes; the last 30 days (09-02..09-27) hold 8 notes + 15 comms. That burst is the demo.
- Notes contradict across time (self-insured 2023 vs coverage confirmed 2026-09-09). Rule: newest dated note wins; show older as history.
- Overdue as of today: pending tasks due 2026-08-25 (McCulloch records) and 2026-09-26 (employment records). Due soon: 10-05 reconcile ledgers, 10-07, 10-10 confirm surgery date, 10-14.
- SOL task/entry (2026-04-22) is `complete` and in the past with the matter still open. Do NOT render as upcoming; show as "passed/complete".
- `avatar` null; `initials` "JS" available. Client has email, phone, Texas address, DOB 1995-12-21.

## The ~10 that matter (picked from 42 notes + 69 comms)

Heuristic: recent AND high-signal (money, coverage, surgery, discovery posture, client contact, credibility risk). Ranked.

| # | id | date | Item | Why it matters |
|---|---|---|---|---|
| 1 | note 2997025613 | 2026-09-15 | Case posture, what is still not done ("Read this before the next discovery conference") | Self-labelled executive summary: liability contested twice (mechanism, scope of employment), prior-ankle gap, nobody contacted Pullano |
| 2 | note 2997025448 (+comm 5029593653, 09-08) | 2026-09-09 | Coverage confirmed in writing | Resolves "limits unconfirmed"; caps recovery at $100k/person |
| 3 | note 2997024458 | 2026-06-04 | Case evaluation $375,000 | Value anchor; economics $332,400; capped by limits; Medicaid lien $22,180 comes off |
| 4 | note 2997024983 (origin 2997024428, 2024-05-27) | 2026-09-18 | Second (right shoulder) surgery is biggest open question | 5 requests, no date; moves case value |
| 5 | note 2997024938 (+2997024608, 09-02) | 2026-09-13 | Both defence IME reports served | Hostin records normal ROM; adverse expert evidence |
| 6 | note 2997025013 | 2026-09-25 | Specials can't close: 2 ledgers unreconciled | $118,400 interim; chiro+PT are largest and least certain |
| 7 | note 2997024833 | 2026-09-06 | Discovery stuck on maintenance records | Compliance-conference risk |
| 8 | note 2997024683 (+comm 5029590653) | 2026-09-27 | Client call: keep attending PT? | Last client contact; also drives treatment continuity |
| 9 | note 2997024323 | 2024-03-28 | Medicaid lien $22,180 + SSD pending | Net-recovery driver; reaffirmed 2025-07-23 |
| 10 | note 2997023858 | 2023-05-23 | Client gave three different mechanism accounts | Credibility risk that outlives its age; old but still live |

Honorable: 2024-02-17 specials tally (2997024263), 2024-01-08 no-fault exhausted, 2023-08-01 left shoulder surgery (anchor of timeline).
Rule for "old but relevant": a note scores on recency OR on "still-open" keywords/cross-refs (e.g. #9, #10 are referenced by later notes). Pure recency would drop both.

## Story 1: "Up to speed, what happened recently, without asking anyone"

| | |
|---|---|
| Feeds | matter (stage Litigation, open_date 2023-05-07, responsible atty), 16 custom_field_values (value $375k, specials $118.4k, wage loss $214k, treatment status, lien, limits confirmed), top-10 above, 7 pending tasks, 6 upcoming calendar (10-09..10-29), last 30d comms |
| Gotchas | Custom fields = latest state but flat; narrative nuance only in notes. 9 "DEMO" expenses carry specials in `non_billable_total` (`total` null). |
| Visual | One-screen "case at a glance": header strip (client initials avatar, stage pill, DOI, days since DOI/open), KPI tiles (value $375k vs limit $100k bar, specials, lien, wage loss), 3-4 sentence AI brief, "Needs attention" list (2 overdue, surgery undated), horizontal timeline of 2023-2026 with the 30-day burst highlighted |
| AI vs code | Code: KPIs, overdue/upcoming, timeline, counts. Model: 4-sentence brief + one-line "why it matters" per top-10 item, each with source ids. Sonnet-class, ~15k in / ~1k out per case (one call, cached) |
| Priority | MUST. Cheapest: KPI tiles from custom fields + overdue/upcoming from tasks/calendar + one cached AI brief |
| Demo moment | Open Sapini: in 3 seconds see $375k value capped by $100k limit, 2 overdue tasks, and "second surgery still undated after 5 asks" |

## Story 2: "What changed since I last opened this matter?"

| | |
|---|---|
| Feeds | Our DB table `views(user, matter_id, viewed_at, snapshot{type:id:etag})`. Diff live fetch vs snapshot: new ids = added, same id different etag = edited, missing = removed. Also business-date filter `date > viewed_at`. |
| Gotchas | Timestamps are seed time, so do NOT use `created_at > last_view`. Must snapshot etags (or content hashes) on first open. Clio can't tell us who viewed. First open has no baseline: show "first view" state. |
| Visual | "Since you last looked (Sep 1)" banner with count chips (+8 notes, +15 comms, 2 tasks now overdue, 1 coverage change), new items get a left accent dot in every list; changed numeric tiles show delta arrow (limits unconfirmed -> confirmed) |
| AI vs code | Code only: diff and chips. Optional model: 2-sentence "what changed" over the diff set only (~2k tokens, Haiku-class). |
| Priority | MUST (judges' favourite, interviewed ask). Cheapest: set stored `viewed_at` to a seeded 2026-09-01 and use note/comm `date` > viewed_at; add etag snapshot for the real thing |
| Demo moment | Reset "last viewed" to Sept 1: banner shows coverage confirmed in writing (09-09), both IME reports served, the 09-15 posture note |

## Story 3: "Out of three hundred entries, show me the ten that matter"

| | |
|---|---|
| Feeds | notes (42) + comms (69) = 111 entries here (+14 tasks, 17 events). Top-10 table above. |
| Gotchas | No author, no flags/priority on notes. 56 emails are 1-paragraph (72-345 chars) with "RE:" as the only thread signal: collapse `Chaser`/`RE: Chaser` and `Discovery status`/`RE:` pairs into one thread by normalised subject. Phone comms mostly client calls. |
| Visual | "Top 10" feed: each card = date chip, type icon (note/email/call), bold title, a one-line AI "why", source link. Under it a muted "Show all 111" expander with type/date filters |
| AI vs code | Code scores: recency decay + keyword/dollar/"confirmed|still|no date" weights + cross-reference count + type weight, takes top 15. Model picks/reorders final 10 and writes the "why" (~11k tokens notes+comms, same call as Story 1). Deterministic fallback ranking if no key. |
| Priority | MUST. Cheapest: code score only, model "why" lines come free from the case-brief call |
| Demo moment | 111 entries collapse to 10 cards; click #1 (09-15 posture note) and the raw note opens beside it |

## Story 4: "Two minutes vs dig into everything"

| | |
|---|---|
| Feeds | Same data, two depths. Level 1 = brief + KPIs + top 10 + attention list. Level 2 = full lists: 42 notes, 69 comms, 14 tasks, 17 events, 31 docs by folder, 14 contacts by role, 14 expenses |
| Gotchas | Docs are PDFs, injuries need `pdftotext`/OCR (summons, letter-to-judge are scans; bill-of-particulars has the injury list, 14 pp text layer). Keep drill-down on raw Clio JSON so no extra AI. |
| Visual | Top-level toggle "2-min view | Full case" (or progressive: summary cards each expand to the underlying records). Full view = tabbed tables with search, unified chronological timeline with type filter |
| AI vs code | Code only for Level 2. Level 1 content already produced by the cached digest. |
| Priority | MUST for the toggle with raw tables (cheap); SHOULD for polished timeline |
| Demo moment | Flip the toggle: 10 cards become the full 111-entry timeline, same facts, every row opens its source |

## Story 5: "Don't re-run AI every time someone opens it"

| | |
|---|---|
| Feeds | Cache key = hash of (matter etag + sorted note/comm/task/event `id:etag`) per digest section. Store digest JSON + `model`, `tokens_in/out`, `cost_usd`, `source_hash`, `generated_at` in our DB (not Clio). |
| Gotchas | Matter `updated_at` is seed time, so key on content etags, not timestamps. A new note should only re-run the sections it touches (brief + top-10), not PDFs/injuries. Per-document hash (`latest_document_version.uuid`) so PDFs are digested once ever. |
| Visual | Small "Digest current as of <time> - 0 AI calls on open" chip; when stale: "3 new items, refresh digest" button with cost estimate. Cost footer ("this case: $0.xx total") feeds `docs/submission.md`. |
| AI vs code | Code: hashing, cache lookup, staleness. Model runs only on miss. Estimated first digest: ~15k structured tokens + ~10-60k for PDFs; Sonnet-class roughly $0.10-0.50/case (confirm with real usage). |
| Priority | MUST (judge-visible and required cost reporting). Cheapest: SQLite/JSON file keyed by source hash, log usage per call |
| Demo moment | Reload the page twice: instant, chip says "cached, $0.00 this open"; touch nothing in Clio. (Do not write to Clio to demo staleness; show it by deleting the cache row.) |

## Story 6: "The client's picture as soon as I open the matter"

| | |
|---|---|
| Feeds | client_contact (name, initials JS, DOB 1995-12-21 -> age 30, email, phone, TX address), matter client, comms filtered to Justin (20 comms; last 2026-09-27 phone, then 09-25, 09-21), note 2025-03-18 (out of work, commission-only), wage loss $214,000, Treatment Status field, upcoming "Client treatment" 10-09/10-10/10-17 and 10-14 call, 10-29 appt |
| Gotchas | No photo (`avatar` null); `photo-id.pdf` is PII, never display. No client notes (contact notes = 0). Client lives in TX, treats in NY (Rockland): show as fact, don't infer. Last-contact must be computed from comms where Justin is sender/receiver, not just any comm. |
| Visual | Profile header card: initials avatar, name, age, "Last contact 5 days ago (call, 09-27, asked if he should keep PT)", status chips (out of work, treating weekly, 2nd surgery pending), next client touchpoints. Injury body-part chips from the bill of particulars (left shoulder labral/infraspinatus tear + arthroscopy 2023-07-26, cervical/lumbar bulges, knees, TBI findings) |
| AI vs code | Code: age, last contact, next appointments, specials by provider. Model: 1-line client snapshot and injury list extraction from bill-of-particulars text (~4k tokens, once, cached). Skip vision/OCR for this. |
| Priority | MUST header + last contact (cheap). SHOULD injury chips. CUT a body diagram unless time remains |
| Demo moment | Opening Sapini shows "Justin, 30, out of work since 2023, last spoke 5 days ago about PT, next PT visit Oct 10" with the injury chips below |

## Build order for these stories (5h)

1. Fetch layer + SQLite cache + etag hashing (Stories 5, 2 depend on it).
2. Deterministic panels: KPIs, overdue/upcoming, last client contact, timeline (no AI).
3. Single cached AI digest call: brief + top-10 "why" + client snapshot (+ injuries from one PDF).
4. Since-last-view banner and 2-min / full toggle.

## Surprises

- All timestamps are seed time, but etags are per-record content hashes: change detection works on etags, not dates.
- The best "executive summary" already exists as a human note (2026-09-15, 1,969 chars): feed it to the model verbatim and cite it.
- Two pending tasks are already overdue, and the SOL entry is past-but-complete: don't show it as upcoming.
- Specials ($118,400) are not custom-field-only: they sum from the 9 DEMO expense `non_billable_total` values, a second source to cross-check.
