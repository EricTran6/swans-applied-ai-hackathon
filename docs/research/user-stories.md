# User Stories and Prioritization (Sapini Clio Dashboard)

Scoring: P = pain severity, J = demo/judge impact, C = build cheapness in 6h solo (5 = cheap), F = Clio data feasibility (5 = straightforward API). Total /20. Scores are my judgment; Clio field assumptions (esp. F) need verifying against the real Sapini data in the first hour.

## 1. Quote scoring

### Attorney

| # | Quote (short) | P | J | C | F | Tot |
|---|---|---|---|---|---|---|
| A1 | Up to speed + what happened recently, without asking anyone | 5 | 5 | 3 | 4 | 17 |
| A2 | What changed since I last opened this matter? | 5 | 5 | 3 | 3 | 16 |
| A3 | 300 entries, show me the 10 that matter | 5 | 5 | 3 | 4 | 17 |
| A4 | 2-minute view vs dig-into-everything (progressive depth) | 4 | 4 | 4 | 5 | 17 |
| A5 | If a date is on screen, show where it came from (provenance) | 4 | 5 | 4 | 4 | 17 |
| A6 | Click anything, open the source note/doc/email | 4 | 5 | 4 | 4 | 17 |
| A7 | Client's picture on open | 2 | 4 | 5 | 3 | 14 |
| A8 | Primary injuries buried in a 200-page scan | 5 | 5 | 2 | 3 | 15 |
| A9 | When did anyone last actually talk to the client? | 5 | 4 | 5 | 4 | 18 |
| A10 | Don't re-digest with AI on every open (cache) | 3 | 3 | 4 | 5 | 15 |
| A11 | Overdue / upcoming / waiting on someone else | 5 | 4 | 4 | 5 | 18 |
| A12 | KPIs: case worth + coverage behind it | 5 | 5 | 3 | 2 | 15 |
| A13 | How much has the firm spent (expenses) | 4 | 4 | 5 | 5 | 18 |
| A14 | What did we share with provider; did they open it | 3 | 4 | 2 | 1 | 10 |
| A15 | Treating doctors see status without my whole file | 4 | 5 | 3 | 3 | 15 |
| A16 | Adjust what provider sees before sending | 4 | 5 | 3 | 5 | 17 |
| A17 | Secure way to share part of case with providers | 4 | 5 | 2 | 3 | 14 |

### Provider

| # | Quote (short) | P | J | C | F | Tot |
|---|---|---|---|---|---|---|
| V1 | Is there coverage behind the case? | 5 | 5 | 4 | 2 | 16 |
| V2 | Is the case still alive (not settled a year ago)? | 5 | 5 | 5 | 4 | 19 |
| V3 | Tell me when the case moves (no emailing) | 5 | 4 | 3 | 3 | 15 |
| V4 | I only see records I sent; one eye closed | 3 | 3 | 3 | 3 | 12 |
| V5 | What does the firm need from my office now? | 4 | 4 | 4 | 3 | 15 |
| V6 | Is my patient still showing up to treatment? | 4 | 4 | 3 | 2 | 13 |

Feasibility notes (assumptions to verify):
- F=2 items (coverage, case value, view tracking, appointment attendance) likely live in custom fields, notes, or nowhere structured. Coverage and value need a custom-field lookup or LLM extraction from notes and docs, and may be sparse.
- F=1 for "did they open it": Clio doesn't know. We must own the share link, so this is our own tracking (cheap in 1 table, but it's new infrastructure, not Clio data).
- Attendance: calendar entries and notes only, not structured. Show "last treatment-related calendar event or note" with provenance rather than claiming attendance.

## 2. Real-world evidence (validation)

Caveat: most hits are vendor and law-firm marketing, so treat the numbers as directional, not rigorous.

- **Client-communication gap is the most documented pain.** A CaseStatus legal CX report says 72% of attorneys call their firm "caring" vs 40% of clients, and 72% of clients want more transparent communication ([CaseStatus](https://www.casestatus.com/blog/nearly-80-of-law-firm-clients-feel-uncared-for-new-survey-reveals-major-disconnect)). A Texas press-release survey claims 71% of clients who fired their PI attorney cited communication, and 94% rate weekly updates critical vs 11.6% of firms providing them ([Barchart/McKay Law](https://www.barchart.com/story/news/36216686/mckaylawtx-com-exposes-industry-crisis-94-of-texas-accident-victims-demand-weekly-updates-only-12-receive-them-insufficient-client-communication-driving-71-of-attorney-firings)); this one is self-promotional, weakest source. Supports A9 ("when did anyone last talk to the client") as a high-pain, judge-resonant item.
- **Record review is the time sink.** Vendor sources cite 10-20 hours of manual medical-record review per case and ~25 hours of total work-up to settlement ([EvenUp](https://www.evenuplaw.com/guides/medical-record-review-for-attorneys-ai-processes/), [Trivent](https://triventlegal.com/blogs/when-is-medical-record-review-consuming-too-much-attorney-case-evaluation-time), [Stafi](https://getstafi.com/blog/medical-records-review-personal-injury-lawyers/)). Supports A8/A3 and the "injuries buried in scans" quote, and also means judges (Supio, EvenUp-adjacent) have seen this demo; differentiate with provenance and the provider view.
- **Lien/LOP providers depend on current case status.** Firms must issue lien settlement letters at resolution and need current documentation to evaluate provider claims before settling ([ChartRequest](https://www.chartrequest.com/articles/letters-of-protection-medical-records), [Gain Servicing](https://gainservicing.com/letters-of-protection-lop-and-medical-liens-in-personal-injury-cases/)). I found no hard stat on providers chasing settled cases; V2 is validated only by the structure of the LOP arrangement (payment is contingent on a settlement the provider can't see) and by the interview quote. Treat as high-plausibility, not quantified.
- **Gap in evidence:** nothing quantified on attorneys wanting "what changed since last open" or on provider portals in PI. Rely on the interview quotes for those.

## 3. Themes and recommendation

### Themes
1. **Triage and recency** (A1, A2, A3, A4, A9, A11): the "two-minute brief".
2. **Trust via provenance** (A5, A6): every datum links to its source.
3. **Hard-to-find facts** (A8, A7, A12, A13): injuries, value, coverage, spend, client photo.
4. **Provider window** (V1-V6, A15-A17): safe, curated, trackable sharing.
5. **Infrastructure** (A10 cache, A14 tracking).

### Hero view
**Attorney "two-minute brief" is the hero; the provider share is the closer.** Reasons: it is the broadest pain, it is what trial-attorney judges personally feel, and every provider-view datum is a filtered subset of it. But the unique differentiator vs other teams is the provider view (the Swans lien angle), so give it a 60-second demo beat: attorney toggles a few items, clicks Send, switch tabs to what the provider sees. The sharing flow is what shows product thinking about a two-sided problem.

### Top features

| Rank | Feature | Priority | Covers | Build note |
|---|---|---|---|---|
| 1 | **Case brief header**: client photo/name, status (alive/settled/closed), stage, key dates, KPI tiles (value, coverage, firm spend), each tile labeled "unknown" when absent | MUST | A7, A12, A13, V2 | Matter + custom fields + expenses sum. Never fabricate a value. |
| 2 | **Provenance everywhere**: each fact/date has a source chip that opens the originating note/doc/email/event (deep link or in-app drawer) | MUST | A5, A6 | Build into the data model first (every extracted fact carries `source_type`, `source_id`, quote span). |
| 3 | **Ranked "10 that matter" timeline**, with a toggle to the full timeline (2-min vs dig-in) | MUST | A1, A3, A4 | LLM or heuristic importance scoring over notes/comms/tasks; cache. |
| 4 | **Action board**: overdue / upcoming / waiting-on-others (tasks + calendar) | MUST | A11, V5 | Cheapest high-value panel; Clio tasks and calendar are structured. |
| 5 | **Last client contact** card (last call/email/meeting, days since, who) | MUST | A9 | Communications + notes; big visual with red when stale. |
| 6 | **Provider share builder**: category toggles with defaults, per-item include/exclude, preview "as provider sees", then Send | MUST | A15, A16, A17 | See section 4. |
| 7 | **Provider view**: status, coverage, what firm needs, shared bills/records, change feed | MUST | V1-V3, V5 | Read-only page via signed link; static snapshot built at send time. |
| 8 | **Injury extraction from scanned PDFs** with page-cited provenance | SHOULD (demo wow, risky) | A8 | OCR + LLM, pre-run offline on the few relevant docs and cache; show the cited page. Do after 1-7 are solid. |
| 9 | **"Since you last visited" diff** (new items highlighted) | SHOULD | A2 | Cheap approximation: store `last_seen` in localStorage/db, flag items with `updated_at` after it. |
| 10 | **Cached digest + visible "generated at / refresh"** | SHOULD (but build early as architecture) | A10 | Cache AI outputs keyed by matter id + max(updated_at). Decide at scaffold time, not later. |
| - | Share view-tracking (opened/last viewed) | SHOULD (cheap if we own the link) | A14 | Log hits on share link token. Genuinely ours, not Clio. |
| - | Provider "is patient attending" | CUT as a metric; fold into "last treatment-related event" line | V6 | No reliable data. |
| - | Provider-uploaded records / two-way records (V4) | CUT | V4 | Violates "never write to Clio". Mention in roadmap slide. |
| - | Push notifications/email on case change (V3) | CUT, show a "recent changes" feed + roadmap | V3 | |

Build order: 2 (data model) -> 1, 4, 5 -> 3 -> 6, 7 -> 10, 9 -> 8 if time remains.

Reality check on KPIs: "what is the case worth" and "coverage" may not be structured in Clio. Check custom fields in the first hour. If absent, render the tile as "Not recorded in Clio" with a link to the closest source; honest absence beats invention in front of trial-attorney judges. Also satisfies "no hardcoded features": the tiles should be driven by field discovery, not by Sapini-specific IDs.

## 4. Provider-share rules

Principle (from organizers): share status changes, bills and records; don't share strategy or provider-irrelevant confidential info. Default is allow-list: nothing is shared unless the category is on the allow list, and attorneys can only widen the default with an explicit toggle.

### Default categories

| Category | Default | Notes |
|---|---|---|
| Case status (open/settled/closed/dropped), stage, last status-change date | ALLOW | Core of V2/V3 |
| Coverage existence and limits (policy type, limits) | ALLOW (attorney-reviewable) | V1; may be sensitive to some firms so toggle visible, but pre-checked |
| Provider's own bills, balances, lien/LOP amount and date | ALLOW | |
| Medical records and treatment documents from this provider | ALLOW | |
| Medical records from other providers (treatment picture) | OFF by default, per-item opt-in | V4, but HIPAA/minimum-necessary; attorney decides |
| Upcoming and past treatment appointments for this provider | ALLOW | |
| Requests from the firm to this provider (tasks tagged to them) | ALLOW | V5 |
| Settlement/demand status in coarse terms ("in negotiation", "settled") | ALLOW | Not amounts |
| Settlement offers, demand amounts, case valuation | DENY (hard) | Strategy |
| Attorney notes, work product, internal comms, strategy memos | DENY (hard) | Privilege |
| Liability analysis, witness statements, defense/insurer correspondence | DENY | |
| Other providers' bills and liens | DENY | Competing lien info |
| Firm expenses and fees, attorney fee percentage | DENY | |
| Client personal data beyond name/DOB-type identifiers (SSN, finances, prior history) | DENY | |
| Tasks/calendar not about this provider | DENY | |
| Anything with tags like "privileged", "internal", "strategy" | DENY (hard) | Tag-based filter, not hardcoded for Sapini |

"Hard" deny = no toggle in the UI (attorney can still share by exporting separately). Everything else is a visible toggle. Because attorneys differ in what they share, make the allow/deny map a per-firm preset the attorney can edit and save, not constants in code.

### Attorney review-before-send UX
1. **Pick provider** (a Clio contact) and the share scope shows pre-checked default categories.
2. **Checklist grouped by category**, each row an individual item (document, event, status) with a checkbox, a one-line preview, and a red "privilege risk" badge if a classifier or keyword rule flags it (e.g., "strategy", "offer", "demand", "settlement authority").
3. **Live preview pane** = exactly the provider page rendering, updating as boxes change ("what the provider will see").
4. **Redaction summary**: "14 items shared, 212 withheld", with a "show withheld" list so the attorney can catch mistakes in either direction.
5. **Confirm and send**: generates an expiring signed link (e.g., 30 days, revocable). The shared content is a snapshot at send time, or a re-filtered live view using the stored selections; choose the live-filtered view if time permits so the provider sees status changes (V3), snapshot if not.
6. Share log entry written to our own store (never to Clio).

### View tracking
- Each share has a unique token. Log: first opened, last opened, open count, and which sections/documents were viewed (page-level events, not pixel tracking).
- Attorney's share panel shows per-provider: sent date, "opened 3x, last 2 days ago", and "not yet opened" in amber after N days.
- Be honest in UI: "opened" means the link was loaded, not that a person read it.
- Store in our own DB, since Clio has no equivalent (this is why A14 scores F=1 for Clio but is cheap for us).

### Demo safety
Ship a visible "Shared with provider" lock icon on every item on the attorney dashboard that is currently exposed, and a one-click revoke. Judges who are trial attorneys will check what is leaking first.
