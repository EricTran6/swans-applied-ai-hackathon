# Story 04: Controlled sharing with lien providers

Baseline: local `.cache/clio/*.json` snapshot (2026-10-02), `docs/contract.md` s9, `docs/plan.md`. No network. Counts below are from my own pass over titles/senders, so treat as approximate (+/-2) and let the classifier produce the real numbers live.

## 1. Classification of the real Sapini records

Recipient assumed: ONE provider (e.g. McCulloch Orthopaedic). "Share" = may appear in that provider's view (as a derived coarse item, never raw text/ids).

| Source (n) | Share-safe | Attorney decides | Withhold |
|---|---|---|---|
| Notes (42) | 0 verbatim | 12 (treatment/records-received/surgery-status notes) | 30 |
| Communications (69) | 27 provider-addressed or provider-sent (records requests, enclosures, surgery scheduling), only that provider's | 0 | 42 (16 client calls/emails, 26 adjuster/insurer/discovery/IME) |
| Documents (31) | 18 (9 medical-records + 9 bills, each only to its own provider) | 1 (hipaa-authorization) | 12 (photo-id, 4 pleadings, 3 discovery, letter-to-judge, 3 experts) |
| Tasks (14) | 3 ("By medical provider: X - updated records", only X's) | 4 (confirm surgery date, reconcile ledgers, 2 completed records requests) | 7 |
| Calendar (17) | 7 (3 upcoming "Client treatment", surgery 2023-07-26, pre-op, post-op, 2024-05-27 surgical consult) | 3 | 7 |
| Custom fields (16) | 4 (Treatment Status, Insurance Carrier, Policy Limits, HIPAA Received flag) | 2 (Date of Incident, Claim Number) | 10 |
| Expenses (14) | 9 "Medical treatment charges" rows, only the provider's own row | 0 | 5 firm expenses ($1,410) |

Notes are the key finding: 42 free-text notes contain strategy, so default-deny the whole `note` type. Provider "updates" must be coarse sentences derived from structured events (stage change, records received, surgery recommended), not note text. This matches the contract rule "no quotes from notes".

### Must withhold (concrete)
1. Note 2026-06-04 "Case evaluation": $375,000 valuation, economics $332,400 (valuation; hard deny).
2. Note 2024-04-29 / 2026-08-03 negotiations: adjuster offer, demand history (settlement; hard deny).
3. Notes 2026-01-12 and 2026-09-15 "Case posture": liability contested on two levels (liability analysis).
4. Note 2023-05-31 prior left-ankle discrepancy and 2023-05-23 "three different accounts" of the mechanism: credibility weaknesses, prior injuries. Titles have no scary keyword, so keyword rules miss both.
5. Notes 2024-03-28, 2025-07-23 + comms 2024-02-17, 2025-03-01: Medicaid lien $22,180, SSD claim, no-fault exhausted. Other liens are privileged client advice and affect a lien provider's negotiating posture.
6. Documents: `08-experts` (Hostin IME, Tsao, Katzman: defense work product), `03-discovery`, `02-pleadings`, `photo-id.pdf` (PII), `letter-to-judge`.
7. Note 2025-03-18 + comm 2025-07-09: client out of work, "cannot afford" the second surgery, wage loss $214,000 (client PII/financial).
8. Custom fields Estimated Case Value, Case Value Rationale, Liability Assessment, Prior Related Injuries, Wage Loss Claimed, Case Summary, Medical Specials total.

### Clearly shareable
- Stage "In litigation" (matter stage Litigation) and "treatment ongoing".
- Provider's own bill + own record PDFs (e.g. `05-medical-bills__...mcculloch...`, `04-medical-records__...mcculloch...`).
- Upcoming treatment: calendar 2026-10-09 chiro, 10-10 and 10-17 PT. Note: those three are different providers, so each provider sees only their own.
- Open requests for that provider: task "By medical provider: McCulloch ... Updated records" (due 2026-08-25, overdue), comm 2026-09-17 "fifth approach" for a surgery date (reduce to "surgery date requested 5x, awaiting your office").
- Coverage: BI limits $100k/$300k confirmed (comm 2026-09-08). Providers on lien care about this; default allow with toggle, never claim number SIR068120.
- Derived status events: "Records received 2023-08-31", "Right shoulder arthroscopy recommended 2024-05-27, no date".

### Per-provider scoping (answers "one eye closed")
Yes: Provider A must NOT see Provider B's records or bills by default. Reasons: (a) the nine bills sum to the $118,400 specials, so showing all bills leaks valuation and lets providers compare charges ($60,000 New Horizon vs $1,450 EMG); (b) minimum-necessary; (c) the ledger/lien priority conflict between providers. Contract already has `own_records` (default allow) vs `other_records` (opt-in per item). Keep it. Scope key: document filename/provider contact, calendar summary, task name all contain the provider name; relationships.json gives the canonical 10 names. Unmatched items (no provider name) default to withhold.

## 2. Rules vs AI

Deterministic, by source:
- Documents by folder: 31/31 correct (folder + filename provider match). Needs no AI. Folder 04/05 allow-and-scope, everything else deny.
- Notes/comms: default-deny by type. Provider-scoped comms allowed only via derived coarse event, so accuracy of "what leaks" is ~100% (nothing raw leaves).
- Tasks/calendar: allow only if name matches `By medical provider|Client treatment|arthroscopy|consult` AND names this provider.
- The contract keyword fallback (`settle|offer|demand|strategy|privileged|valuation|lien`) is a tripwire, not a classifier: it misses notes 2023-05-31 ("Prior injury discrepancy"), 2023-05-23 ("three accounts"), 2026-01-12 ("Case posture"), 2025-03-18 (client out of work) and it false-flags the provider's own bill (a "lien" provider) and "Records request". Do not rely on it for allow; use only to downgrade.
- Realistic: rules ~95% on documents/tasks/calendar, but only safe because notes are default-deny.

Where AI adds value (Haiku, enum output, can only lower inclusion):
1. Review each derived update sentence and the pick-list items: "mentions money/valuation/liability/other provider? ok|review|block" with a reason shown inline. Catches e.g. a task description that quotes a number.
2. Attribute free-text items to a provider when the name is absent.
3. Draft the 1-line coarse update from an allowed event (then validator checks no `$` figures except limits).
Fail-closed: AI error, timeout, unknown category, unparseable output, or unmatched provider => `included=false, flag=review`. New category added later => deny. Attorney can only raise inclusion for non-hard-deny items; hard deny (valuation, settlement, attorney_notes, internal_comms) has no toggle.

## 3. Security minimum for demo
- Token: `crypto.randomBytes(32).toString('base64url')`, store only sha256, compare with `timingSafeEqual` (already in contract). Show full link once. Link `/s/<token>`.
- Expiry (default 14d, `expiresAt` already in ProviderView), revoke = set `revoked_at`; expired/revoked/unknown all return the same 404 (no oracle).
- Snapshot: freeze `ProviderView` JSON at send time in own SQLite; provider route never calls Clio and never reads the digest. Frozen is also the leak-proof choice and fast; "refresh" = new share version made by the attorney.
- View log: table `share_views(share_id, viewed_at, ua_hash)`; attorney sees "opened 2x, last 10:42". Count the view via POST after render (not GET) so link-preview bots and email scanners don't inflate it; log no IP in plain form.
- No PHI in logs: log ids and categories only, never preview text/names; return `Cache-Control: no-store`, `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer`; provider page loads no third-party scripts.
- Audit: store `preset_json` and the final included candidate ids per share (answers "what did we share?"), including what was withheld by count.
- HIPAA: custom field "HIPAA Authorization Received" = true (matter.json custom_field_values; `01-intake__created__hipaa-authorization.pdf`; comm 2023-05-14 "Signed retainer and HIPAA returned"). That authorization is the client's release to the firm and adjuster, so treat it as evidence of client consent, not as a compliance claim: show a "HIPAA auth on file" badge and hold the Send button disabled if the field is not true. Do NOT say "HIPAA compliant" (competitive.md line 74). Also the client's own consent to sharing is the real gate under attorney confidentiality rules.

## 4. Visuals

Builder (the demo centerpiece): two columns.
- Left: grouped checklist by category (Status, Stage, Coverage, Appointments, Requests, Own records, Updates), per-item toggle, AI flag chip (ok / review / block + reason). Withheld group collapsed below with lock icons and a reason ("Case valuation: never shared").
- Right: "What McCulloch will see" live preview rendering the real provider page component fed the current selection (same component as `/s/<token>`; no second implementation).
- Sticky top counter: "14 shared / 31 withheld" with a segmented bar (green shared, amber needs review, gray withheld). Toggling updates counter and preview instantly. The count of items, not names, is the pitch ("we held back 31 items incl. valuation and Medicaid lien").
- Recipient dropdown (10 providers) swaps scope; show "Dr. Capiola sees 2 records, 1 bill" to make scoping visible.
- Send step: summary modal, expiry select, copy link.

Opened status: share list row with a status pill: `Sent` (gray) -> `Opened 2x, last 10:42` (green dot) with a tiny timeline of view events; `Not opened in 3d` amber; `Revoked/Expired` red. Revoke button on the row.

## 5. MUST / SHOULD / CUT (5h build)
MUST: provider picker + preset with hard-deny + per-provider scoping; checklist + live preview + counter; token/hash/expiry/revoke; frozen snapshot; provider page; view POST + "opened Nx, last time"; HIPAA-on-file gate; keyword downgrade tripwire.
SHOULD: Haiku flag chips with reasons (can ship keyword-only first); share history list with "what we shared"; no-store headers; opt-in `other_records` toggle.
CUT: email sending (copy link only), provider login/accounts, per-document redaction, PDF watermarking, re-share/version diff, multi-recipient, IP geolocation.

Demo moment (30s): open Capiola builder; counter reads "14 shared / 31 withheld"; hover the lock group to show "Case valuation $375,000" and "Medicaid lien" are blocked; Haiku chip flags a note-derived update as `review`; click Send; switch to private window, show the provider page (own records, upcoming PT, "surgery date requested 5x"); back on the attorney screen the pill flips to "Opened 1x, just now". Closer: revoke, reload provider tab, 404.

Traps to avoid in the demo data: do not show total specials ($118,400) or Medicaid lien on provider page; overdue SOL task (2026-04-22) is internal; `$` check in validator (only coverage limits allowed).
