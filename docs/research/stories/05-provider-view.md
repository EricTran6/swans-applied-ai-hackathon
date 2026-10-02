# 05 Provider view (lien-treating medical provider), grounded in the Sapini cache

Baseline: `.cache/clio/*.json` snapshot of 2026-10-02 (no network). Examples use two providers: **SportsCare PT** (PT) and **Advanced Rockland Chiropractic** (chiro). Everything below is derivable by code from Clio fields unless marked AI/PDF.

## Key data facts that shape the view
- Provider bills = 9 "Medical treatment charges - DEMO" expense rows, amount in `non_billable_total`, provider name + service range + bill filename in `note`. Chiro $14,220 (services 2023-04-26 to 2024-08-15). SportsCare $5,825 (services 2023-06-29 to 2023-12-14). Both say "payment status unknown".
- There is NO per-provider lien status in Clio (no lien contact, no payments, no reductions). Only matter-level custom field "Health Insurance or Lien Holder" (Medicaid $22,180), which is another party's lien: never show to a provider. Honest per-provider "lien status" = "Bill on file as of <date>", not "lien confirmed". Parse of provider name from `note` is a string match on relationship names (brittle; AI-free normalizer + manual mapping fallback).
- Stale-bill finding (great demo hook): treatment is ongoing weekly (notes 2025-04-22, 2026-09-27) but SportsCare's bill on file ends 2023-12-14 and chiro's 2024-08-15. The firm cannot close specials until ledgers are reconciled (tasks, note 2026-09-25). So "your bill" must be shown as "on file through <date>; updated ledger requested".
- Matter: stage Litigation, status Open. Latest firm activity: note 2026-09-27, comm 2026-09-26 (chiro ledger request). `created_at/updated_at` are all seed time: use `date`/`start_at`/`due_at` only.

## Story 1: "Is there coverage behind the case?"
- Data: custom fields Policy Limits Confirmed = true; note 2026-09-09 + comms 2026-09-08 ("confirmed in writing"). Defendant Metro-North is self-insured public authority; Claims Service Bureau is the adjuster. Limits text: $100k/$300k liability, $50k no-fault (exhausted per note 2024-01-08), UM/UIM $25k/$50k.
- Provider-safe display: chip **"Liability coverage confirmed in writing (Sep 9, 2026)"** + "Defendant: public authority, self-insured". Default shows NO dollar limits. Attorney toggle may add "Liability limits: $100k per person" (contract s9 says coverage limits allowed with a visible toggle).
- WHY no numbers by default: specials $118,400 + $100k limit shows a shortfall; a provider who infers it will demand reductions or stop treating. Also never show Estimated Case Value ($375k), rationale, Medicaid lien, UIM (strategy). Never show claim number SIR068120.
- Honest caveat chip text for no-fault: "No-fault benefits exhausted" is a fact useful to the provider (they cannot bill it) but hits "other_liens/no-fault" territory: opt-in only.

## Story 2: "Is this case alive?"
- Answer for either provider: **"Active, in litigation. Last firm activity: Sep 27, 2026 (client call). Next court-side event: file review/compliance conference Oct 21, 2026."** Status = matter.status Open; stage = matter_stage "Litigation" mapped by code to "In litigation" (contract s9 enum).
- Alive/stalled rule (code): alive if status Open and any note/comm/task/calendar date within 30 days; else "stalled". Sapini = alive (5 days). Never expose settlement/offer language: keyword filter on updates.
- Do NOT render the SOL date: task/calendar 2026-04-22 is in the past, marked complete (notice of claim served). Hide it from providers.
- Stage pill sequence (Treating > Pre-suit > In litigation > Settled/paying liens > Closed) with "you are here"; settled-before-you-knew is the pain, so the last rail node reads "We will notify you here".

## Story 3: "Tell me when the case moves"
- Status change in this data = (a) `matter_stage` change, (b) matter status/close_date change, (c) new/changed calendar entry of a court-ish type (compliance conference, IME) rendered coarsely, (d) new task/comm naming this provider (records request), (e) new documents in own folder, (f) coverage chip flips. Compute by diffing our snapshot (provider-relevant projection) vs the snapshot at `last_viewed_at`.
- UI: "Since your last visit (Sep 18)" banner with a diff list: "+ Records request from the firm (Oct 7 due)", "Stage unchanged: In litigation". Empty state: "No change. Firm last active Sep 27." (empty state is itself the answer to "is it alive").
- Without webhooks: our re-sync (poll Clio on demand/cron + cache by `updated_at`) feeds the diff. Real email notify = OUT for 5h (note as stub: "Email me on change" toggle stored in our DB, no sender). CUT or fake? Do not fake: store the preference, say "email alerts next".
- Caveat: Clio seeded `updated_at` is identical everywhere, so diff must hash projected fields, not trust timestamps.

## Story 4: "I only see the records I sent"
- Authorization: HIPAA Authorization Received = true (custom field, hipaa-authorization PDF). Show as chip "Patient HIPAA authorization on file". Only unlock cross-provider tab when true; else lock with reason.
- Available: 9 providers' record PDFs + bill of particulars (sworn injuries by body part) + imaging note 2023-09-20. Safe/useful cross-provider panel ("Care team and findings"): body-map or list of diagnoses (left shoulder labral tear and infraspinatus tear, synovitis, cervical/lumbar bulges, knee, TBI findings), procedures (left shoulder arthroscopy 2023-07-26 at New Horizon; right shoulder arthroscopy recommended 2024-05-27, undated), imaging (Hudson Valley radiology), EMG/NCV (Miller), neuro (Kwan), other treating providers and specialty.
- Source tiers: sworn bill of particulars is the cleanest (already filed/served, not privileged strategy). Treating-provider records are clinical = fine under auth. DENY: IME reports (Hostin, Tsao) and radiology review (Katzman) = defense/expert, adversarial; prior related injuries and credibility notes; wage loss; anything from notes (attorney work product).
- Do the clinical summary as AI extraction from PDFs (needs Sonnet, text layers exist, ~10-20k tokens for the 8 non-chiro records + BoP). Each item cites doc + page (traceability rule). Attorney reviews before the share (existing flow).
- Opt-in per item; default for a provider = their own records + care-team list (names/specialty only), clinical findings opt-in.
- Cost/risk note: the provider seeing the surgery plan and "second surgery undated" is clinically relevant (coordination) but is also valuation-adjacent; phrase as "Right shoulder surgery recommended, date pending" only.

## Story 5: "What does the firm need from my office?"
Tasks that name the provider (match on task name "By medical provider: <name>"):
- SportsCare: "Ongoing treatment notes since last production" due 2026-10-14 (two requests unanswered; comms 2026-03-23, 2026-05-05 chasers; latest 2025-05-07 ledger request). Plus ledger reconcile (task 2026-10-05, internal) => ask: "updated itemized ledger with CPT lines".
- Advanced Rockland Chiro: "Current daily notes + itemised bill to date" due 2026-10-07; comm 2026-09-26 asked for ledger.
- McCulloch Ortho (other example): updated records + right shoulder surgical date, overdue since 2026-08-25.
- Provider-safe wording: title and due only, rewritten by template, e.g. "Send treatment notes from Dec 2023 to today". Strip internal reasons ("closes out specials", "valuation problem"). Internal-only tasks (wage records, reconcile ledger) never shown; "reconcile ledgers" shown to both chiro and PT as part of the bill request.
- Overdue tasks get a red "due in 5 days / overdue" chip; checklist items cannot be ticked by provider (no write to Clio). Optional "Mark as sent" stored in OUR DB, shows firm a badge: good, cheap, aligns with rules.
- Upload to firm = CUT (needs storage + PHI risk); give a "reply to <paralegal>" mailto.

## Story 6: "Is my patient still showing up?"
- Structured data available: upcoming calendar "Client treatment" entries only: chiro 2026-10-09 (Haggerty D.C.), PT SportsCare 2026-10-10 and 2026-10-17 (weekly). Attendees empty; no past visit rows, no no-show flags.
- Past attendance exists only inside PDFs: chiro 52 SOAP visits, PT 20 visits (+ 91 days of notes after a discharge note), derived from records PDFs (dates in text). Notes: 2025-04-22 "weekly PT and chiro, not discharged", 2026-09-27 client asks to keep attending PT.
- Provider-safe attendance view: "Upcoming: Fri Oct 10 weekly PT" + "Firm told patient to continue treatment (Sep 27)" + sparkline of visit dates by month parsed from OWN records PDF (AI/regex, labeled "from records you sent, through <date>"). Do not invent "attended" for future dates. Do not show the firm's pressure re surgery or patient's own statements beyond "advised to continue care".
- Gap: PT bill/notes end 2023-12 and the firm has not received newer notes (three requests), so the sparkline would flatline at 2023. This is truth, and the right message: "No visit notes on file after Dec 2023. Please send updates." Do not claim the patient stopped.
- Patient privacy: the calendar entry text contains "Client attending" (firm note): use only date, provider, and type.

## Their bill and lien (single card)
SportsCare: "Bill on file: $5,825.00, services 6/29/23 to 12/14/23. Updated ledger requested." Advanced Rockland: "$14,220.00, 4/26/23 to 8/15/24". Both: "Payment status: unknown/not tracked by firm". No total specials, no other provider amounts, no Medicaid mention, no reductions. Do not call it "lien confirmed" (no source). Source link = the itemized bill PDF filename (provider's own doc: ok to link).

## Visual (mobile one-pager, in this order)
1. Header: "Justin S. - SportsCare PT" + share expiry + "Updated Oct 2".
2. **Status rail** (5 stages, current = In litigation, "Last activity Sep 27") with coverage chip beneath it.
3. **Since your last visit** diff strip.
4. **What we need from you** checklist with due chips (largest tap targets; this is the primary action).
5. **Your bill** card (amount, service range, "on file through", stale flag).
6. **Treatment rhythm**: attendance sparkline + next 2 appointments.
7. Collapsed **Care team and findings** (HIPAA gated).
Source badges on every fact (reuse the firm-side provenance chip, but redacted to "Source: firm file, <date>"; no Clio links, no quotes from notes, per contract s9).

## AI vs code
- Code: stage mapping, alive/stalled, task-to-provider match, bill parse (`non_billable_total` + note regex), calendar filter, snapshot diff, share token/expiry, view tracking.
- AI (Haiku, enum/short output): classify each candidate ShareCategory + flag leaks; rewrite internal task text to provider-safe request; one-line "case moved" copy. Sonnet: clinical summary from PDFs with page citations (only if time).

## MUST / SHOULD / CUT (5h build, provider side)
- MUST: status rail + alive + last activity; coverage chip (no numbers); "what we need" from tasks naming the provider (templated text); their bill card with stale flag; share page token + opened/viewed tracking; hard-deny filter (valuation, notes, other liens).
- SHOULD: "Since your last visit" diff (needs 2 snapshots: demo by re-syncing + a stored previous projection); upcoming treatment appointments; attorney review screen with leak flags; Haiku rewrite of tasks.
- COULD (if time): attendance sparkline from the provider's own PDF dates (regex on dates, no AI); care-team list (names/specialty from relationships).
- CUT: email notifications (store preference only), webhooks, provider uploads, cross-provider clinical AI summary (describe as "next", maybe mock only with real BoP citations if time), payment tracking, reductions/negotiation.

## Demo moment (30s, provider side)
Attorney opens share builder for SportsCare: AI flags the "valuation problem" task text red and auto-rewrites it to "Send treatment notes since Dec 2023". Send. Open the provider link on a phone: "In litigation, active, last activity Sep 27", coverage chip "confirmed in writing", checklist "Send notes (due Oct 14)", bill card "$5,825 through Dec 14, 2023: updated ledger requested". Then Clio-side add of any new note, re-sync, reload provider page: "Since your last visit" shows one new line, and the firm dashboard shows "Opened by SportsCare 2 min ago". Answers "chasing money on a case that settled a year ago" and "should not have to email".

## Risks / open questions
- Provider-name matching: `DEMO` notes use the long legal name; relationships use the same strings, so exact-match works for the 9, but "Dr. David Capiola" is billed under McCulloch/New Horizon.
- Matter-level Policy Limits Confirmed contradicts 2023 notes (self-insured, no limit); use latest note date (profile doc).
- Whether to show limits is an attorney policy call: default off.
