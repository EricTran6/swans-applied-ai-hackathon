# Stories 1-4: status, contact and money (as of 2026-10-02)

Source: `.cache/clio/*.json` snapshot (tasks, calendar_entries, communications, notes, expenses, matter). Numbers below were computed from those files, not copied from the profile. In the app every number must be computed at read time from live Clio. Values here are only the expected output for the demo check.

## Story 1: overdue / upcoming / waiting on others

Two independent axes. Do not make three flat buckets, because the same item is both "overdue" and "waiting on a provider".

- Time axis (deterministic): `status=pending` and `due_at < today` is overdue. Otherwise upcoming, sorted by due date. Calendar entries with `start_at >= today` are upcoming.
- Ball-in-court axis (who owes the next move): us / client / third party / court-or-defense.

Pending tasks (7), tasks.json:

| Task id | Due | Bucket | Days | Ball in court |
|---|---|---|---|---|
| 1417191998 McCulloch: records + R shoulder surgical date | 2026-08-25 | OVERDUE | 38 late | provider (3 written requests, 5th approach 09-17, reply 09-24: "will call with a date") |
| 1417192088 Employment/commission records from client | 2026-09-26 | OVERDUE | 6 late | client (comm 5029590473 on 09-21, call 09-27 "will send soon") |
| 1417192043 Reconcile chiro + PT ledgers | 2026-10-05 | upcoming | in 3 | us (blocked by two provider tasks) |
| 1417192013 Chiropractic: notes + itemised bill | 2026-10-07 | upcoming | in 5 | provider (ledger request sent 09-26, comm 5029592033) |
| 1417192103 Confirm R shoulder surgery date, Dr. Capiola | 2026-10-10 | upcoming | in 8 | provider |
| 1417192028 SportsCare PT: treatment notes | 2026-10-14 | upcoming | in 12 | provider (2 requests unanswered) |

Future calendar (7 entries): 10-09 chiro session; 10-10 PT session; 10-10 call to McCulloch (4th attempt); 10-14 client follow-up call; 10-17 PT; 10-21 file review (compel decision); 10-29 client appt (employment records). Mark which tie to an open task (10-10 call = task 1417192103; 10-14 and 10-29 = employment records).

Headline: 2 overdue, 4 upcoming tasks within 12 days, 7 calendar events, 4 of 6 open tasks waiting on someone else (3 providers, 1 client).

"Waiting on others" rule:
- Deterministic v1: assignee is always Eric Tran, so assignee is useless. The task name prefix "By medical provider:" marks provider requests (3 of 4 waiting items). Fragile but it is a firm convention. Also: task name matches `from client` means client.
- Better and still deterministic: a task is waiting when a sent request (communication with `user`/sender = firm, to an external receiver) exists after the task's last activity and no inbound reply from that receiver follows. Counts of attempts come free (McCulloch: 5). Works because receivers carry id and name.
- AI is needed only for ball-in-court on free text ("Reconcile ledgers" is blocked-by-others, "Confirm date with Capiola's office"). One cached Haiku classification per task, keyed by `etag`, with a reason string and a link to the supporting comm. Use it to label, not to bucket by date.
- SOL gotcha: task 1417191968 (due 2026-04-22) is `complete`, with `statute_of_limitations:true`. Matter `statute_of_limitations.status=complete`. Calendar 5061520493 still reads "SOL expires" on the same date. Never render it as overdue or upcoming. Filter `statute_of_limitations==true` tasks and calendar entries into a "SOL: satisfied" chip. Task text says suit was commenced in time, and expense 8140023488 shows the complaint was filed 2024-07-21. That is the traceable proof.
- Also exclude past calendar entries from "overdue". Calendar events do not go overdue.

Visual: three-lane board or a timeline strip with today marker. Red tick for the two overdue, amber/blue for upcoming, with an avatar chip (provider/client/us) and an "attempts: 5" badge. Click opens the task plus the linked comms.
Split: all bucketing and day arithmetic in code. AI only for the "blocked by" label. MUST: overdue/upcoming. MUST: waiting-on-others via the comm-reply rule. SHOULD: AI ball-in-court label. CUT: calendar-to-task linking if short on time.
Demo moment: the McCulloch row, 38 days late, "5 requests, no date" with the five communications fanned out underneath.

## Story 2: last client contact

Client id 2437351988. 20 of 69 communications involve the client (as sender or receiver). 4 have the client as sender (2023-05-07, 2023-05-14, 2025-04-08 email, 2025-07-09 phone).

Gotcha: client phone calls are logged with sender = Eric Tran, receiver = Justin Sapini even when the client called ("Justin called ..." in body). So `sender==client` underreports. Use "client is sender or receiver" and the type.

| What | Date | Record | Days ago |
|---|---|---|---|
| Last real conversation (phone, client called in) | 2026-09-27 | comm 5029590653, note 2997024683 "Client call: treatment status" | 5 |
| Phone before that (firm to client) | 2026-09-25 | comm 5029592213 | 7 |
| Last email to client (one way, no reply logged) | 2026-09-21 | comm 5029590473 | 11 |
| Last email sent BY client | 2025-04-08 | comm 5029592408 | 542 |
| Last inbound call logged with client as sender | 2025-07-09 | comm 5029592678 | 450 |

Rule (deterministic): "actually talked" = `PhoneCommunication` with the client in senders or receivers. Emails count as outreach, not contact. Show both: "Last spoke 5 days ago (phone, 09-27)" and "Last email to him 11 days ago, unanswered". Notes link: note 2997024683 on the same date confirms the call. A note whose text starts with "Justin called" is the tie-breaker. Do not rely on note.contact (client notes are empty).
Direction of the 09-27 call (client-initiated) needs a body match on "called" or one cheap AI tag. Skip it: show the date and type only.
Visual: a recency chip with a color ramp (green under 14 days, amber 14 to 30, red beyond), plus a 12-month contact sparkline of dots (phone vs email). Click opens the comm body.
MUST: the chip and date. SHOULD: sparkline. CUT: direction inference.
Demo moment: "Last spoke 5 days ago" with the source note, followed by "still has not sent employment records" (open task, 6 days overdue). One screen links contact to the overdue item.

## Story 3: case value vs coverage

Inputs and where they live:

| Number | Source | Structured? |
|---|---|---|
| Estimated value $375,000 | custom field Estimated Case Value (currency) | yes |
| Specials $118,400 | custom field Medical Specials To Date (currency) and sum of 9 expense `non_billable_total` | yes, cross-checks to the dollar |
| Wage loss $214,000 | custom field Wage Loss Claimed (text: "$214,000.00 claimed to date...") | parse text |
| Defendant BI $100k/$300k, UM/UIM $25k/$50k, no-fault $50k | custom field Policy Limits (multi-line text) | regex parse (3 lines) |
| Limits confirmed | checkbox Policy Limits Confirmed = true. Comms 5029591088, 5029593653 (09-08), note 2997025448 (09-09) | yes plus source |
| Medicaid lien $22,180 | custom field Health Insurance or Lien Holder (text) and notes | parse text, no lien contact exists |
| No-fault exhausted | same text field; note 2997025448 | prose only |
| UM/UIM adds nothing | notes 2997024458, 2997025448 | prose only (AI or rule) |

Conflicts and gotchas:
- Insurance Carrier field says "SELF-INSURED" while Policy Limits shows $100k/$300k and the adjuster "confirmed" BI limits. Older notes (2023) say no declared limit. Latest dated source wins: show "Confirmed 2026-09-08" with a source link and mention the carrier-field wording as a flag.
- UM/UIM $25k is lower than the $100k BI limit, so it adds $0 (NY supplementary UM is excess over the tortfeasor limit). Do not stack it into the coverage total. Show it as a hatched "nominal, not additive" segment. This is a legal conclusion taken from notes. Cite them.
- No-fault $50k is exhausted and not recoverable from the tortfeasor (Ins. Law 5104(a)). Show as "already spent", not as coverage. Unknown whether the 118,400 includes no-fault paid amounts. Flag it.
- Wage loss rests on one 2022 1099, no expert. Specials are interim and chiro/PT ledgers unreconciled (notes 2025-12-08, 2026-09-25). Show a "soft number" badge.
- Fee percentage and fee are not in the data. Do not invent. Stop the waterfall at "before fees".
- Dollar parse: strip `$`, `,` and `.00`. Take the first money figure per labelled line.

Computed (code):
- Economics 118,400 + 214,000 = 332,400 (matches note and rationale).
- Value over economics: 375,000 - 332,400 = 42,600 implied non-economic (11.4% of value).
- Effective coverage = max(BI 100,000, UM/UIM-excess 0) = 100,000. That is 26.7% of the 375,000 estimate, so the uncovered gap is 275,000 (73.3%). Coverage is below the specials alone (84.5% of 118,400).
- Waterfall: 375,000 value - 275,000 uncollectable gap = 100,000 cap - 22,180 Medicaid lien - 1,410 firm costs = 76,410 before attorney fees. Per-occurrence $300k is irrelevant (single claimant).

Visual (the hero of this section): one horizontal range bar on a 0-to-$375k axis. Layers from left to right: lien (red, 22,180) | net before fees (green, 77,820) | = BI cap 100k marker | hatched UM/UIM 25k ("adds $0") | long grey "unrecoverable gap 275k" to the 375k value tick. Overlay ticks: specials 118.4k, economics 332.4k. Below the bar, a 4-row waterfall table with a source chip per row (field name, note id and date). Headline KPIs: "$375k worth" and "$100k behind it" with "27 cents on the dollar".
AI vs code: all arithmetic, the bar and the waterfall are code. AI (or regex) extracts the layered numbers from the Policy Limits and Lien text, once per `updated_at`. The UM/UIM-adds-nothing and exhausted-no-fault judgments come from the AI, carrying quotes from the notes as proof. If AI extraction disagrees with the arithmetic (for example specials versus the sum of expenses), show a mismatch badge.
MUST: two KPIs plus bar. SHOULD: waterfall to before-fees, mismatch badge. CUT: fee scenarios, per-occurrence $300k, settlement calculator.
Demo moment: the bar. "Case is worth $375k; the coverage behind it is $100k, and Medicaid takes $22k of that." The gap is visible without reading.

## Story 4: firm spend

expenses.json has 14 ExpenseEntry rows. Split by shape, not by the string "DEMO" (do not hardcode that): real expenses have `price` and `total` set. Provider charges have `total=null` and `non_billable_total>0`.

Real case expenses (5 rows) = $1,410. `expense_category` is null on all, so category is the note prefix before ":".
- Records reproduction $600: 85 (2023-11-09, Montefiore), 65 (2023-08-31, McCulloch), 450 (2023-11-29, remaining providers and imaging)
- IME observer $600 (2026-09-03, both defence exams)
- Court filing $210 (2024-07-21, summons and complaint)
- All `billed=false`, notes say "paid by the firm, not yet reimbursed". The range is 2023-08 to 2026-09.
- Spend = 1.4% of the $100k cap. It is recoverable off the top at settlement.

Medical charges (9 rows, `non_billable_total`) = $118,400. This is the provider bills, not firm spend. Keep it out of the firm-spend KPI. Largest: New Horizon Surgical 60,000 (50.7%), Hudson Valley Radiology 15,900, Advanced Rockland Chiropractic 14,220, McCulloch 9,530, SportsCare PT 5,825, Miller 4,800, Montefiore 3,475, Kwan 3,200, Interventional PM&R 1,450. Sum equals the Medical Specials custom field, which makes a free cross-check. The `note` field carries the bill filename, which gives source traceability, and the service date ranges for each provider (these double as a provider-view bill list).
Gotcha: summing `total` gives 1,410 only because the nine provider rows are null. Summing `price` double counts nothing but gives 118,400+1,410 = 119,810 across all rows. Always branch on shape.

Visual: a KPI tile "Firm has advanced $1,410" plus a small 4-slice bar by category, with a second grey "Provider charges (not firm spend) $118,400" tile that routes to the medical specials. Each slice is clickable to the expense row.
Split: 100% code. Category label from the note prefix (code), no AI.
MUST: the $1,410 tile. SHOULD: category split and the provider bills list (needed by the provider view anyway). CUT: spend timeline.
Demo moment: pair it with Story 3 in the waterfall ("$1,410 firm costs comes off before the client's share") and show the split of the provider bills as a bar.

## Cross-story notes
- Single data pull per story: `tasks`, `calendar_entries`, `communications`, `expenses`, `matter.custom_field_values`. All 5 are cached files, so there are no AI calls for stories 1 (v1), 2 or 4. AI is only text extraction for story 3 and the optional label in story 1, around 3k tokens, a negligible cost per case.
- Unescape HTML entities in note/comm bodies (`&#39;`) before display or parsing.
- Timestamps `created_at/updated_at` are seed time (2026-10-02). Use `date`, `due_at`, `start_at` only.
