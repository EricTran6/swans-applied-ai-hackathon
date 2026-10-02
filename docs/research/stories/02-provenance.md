# Story 02: Trust and provenance (attorney)

Baseline: local `.cache/clio` snapshot of 2026-10-02 (no network). Deep-link formats come from knowledge, not the repo: clio-api.md has no web-URL section. All marked UNVERIFIED.

## Story 3 first (the hard one): "primary injuries in a 200-page scan"
- Reality check: there is no 200-page scan. 361 pages total, only ~15 are image-only. The text layer is enough for injuries. Demo line: "the 'scan' is a 361-page PDF pile; we read all of it".
- Primary source: `02-pleadings__doc-07__bill-of-particulars.pdf` (14 pp, text layer, NYSCEF stamped, footer "N of 14" equals absolute page, so `page` is trivially right).
  - p3 (para 9, LEFT SHOULDER): "TEAR OF THE POSTERIOR INFERIOR LABRUM AT THE 8 TO 9 O'CLOCK POSITION"; "TEAR OF THE POSTERIOR FIBERS OF THE INFRASPINATUS TENDON"; "SYNOVITIS"; surgery "BY DAVID CAPIOLA, M.D. ON JULY 26, 2023, AT NEW HORIZON SURGICAL CENTER".
  - p4: left shoulder summary list; p5: right shoulder (labral tear, anterior infraspinatus tear, "NECESSITY FOR RIGHT SHOULDER ARTHROSCOPIC" surgery); HEAD: "CEREBRAL CONCUSSION", "POST-CONCUSSION SYNDROME", "ABNORMAL DIFFUSION TENSOR IMAGING".
  - p5-6: cervical (straightening; C5-C6 bulge p7 "FLATTENING THE LEFT VENTRAL MARGIN"), knees (p6 "TEAR OF THE POSTERIOR HORN OF THE MEDIAL MENISCUS"), p8 lumbar "L5-S1 DISC BULGE". p9-11: permanency, "serious injury" Art. 51 (NY Ins. Law).
- Corroboration (also text layer): ortho records (24423, 8 pp), New Horizon operative report (27048, 3 pp), radiology (23103, 7 pp), Montefiore ER (25938, 3 pp), expert reports 37608/38523/39363; notes 2023-08-01 (post-op), 2024-05-27 (right shoulder MRI), 2023-09-20 (imaging summary).
- Scans (15 pp: summons-complaint 8, letter-to-judge 1, photo-id 1, defendants-response pp7-11): complaint scan is pleading-level ("serious injuries"); the specifics live in the BOP, which is text. I did not OCR the scans (no tool run), so "no injury info only in scans" is high-confidence but UNVERIFIED for the complaint. Skip photo-id (PII). Cheap hedge: vision pass on summons-complaint only (8 pp, ~20k tokens, ~$0.06 on Sonnet) as a labeled "scanned, read by vision" source chip; CUT unless time remains.
- Method: `pdftotext -layout` per page (pdf.js/pdfplumber in-app), store `{docId,page,text}`. LLM gets BOP pages 3-8 with page markers, returns `{bodyPart, finding, status(surgical/diagnosed/claimed), quote, page}`. Code verifies quote (whitespace/case-normalized, since text is ALL CAPS, curly quotes, hard line breaks) is a substring of that page.

## Story 1: "where did this date come from"
Feeds: notes.date (plain date, authored-date), communications.date, calendar_entries.start_at, tasks.due_at/completed_at, matter custom field "Date of Incident" (2023-04-23) and matter.open_date, statute_of_limitations.due_at, expenses.date, PDF dates (NYSCEF filed stamps, bill filenames carry dates). Never use created_at/updated_at (all 2026-10-02 seed time; fake provenance trap).
- Every date chip carries `sourceType` (note | email | phone | calendar | task | custom_field | matter | pdf), `sourceDate`, `derivation` (contract.md: stated | inferred | clio-metadata). Rendered as a small icon + "from note 2024-05-27" on hover/inline.
- Conflicts in data (show "latest source wins + others"):
  - Coverage: note 2023-05-14 "Metro-North is self-insured... no carrier" vs note 2026-09-09 "Coverage confirmed in writing... $100,000/$300,000" vs custom field Policy Limits Confirmed=true (matter-level, undated). Winner: 2026-09-09; show struck-through earlier entry as "superseded".
  - Surgery date: calendar entry 2023-07-26, BOP "JULY 26, 2023", note dated 2023-08-01 saying "DOI + 94" (= 2023-07-26; the note date is the write-up, not the surgery). Agree on the date, but the note's `date` is NOT the event date: code must not treat note.date as event date. Right-shoulder surgery: recommended 2024-05-27, still undated 2026-07-04/09-18 (5+ requests); show "unscheduled", not a date.
  - Specials $118,400 (field, note 2024-02-17, 9 expense rows sum of `non_billable_total`) vs notes 2025-12-08/2026-09-25 "interim, ledgers unreconciled". Show value with an "unreconciled" flag.
  - SOL due 2026-04-22: task complete, matter still open; render as "passed/complete", not upcoming.
- UI rule: a fact has `refs[]` sorted by sourceDate desc; headline = newest `stated` ref; "N other sources" popover lists the rest with agree/conflict marker. Code computes conflict (same key, different value); AI only proposes the key.

## Story 2: "click anything, open the note/doc/email"
Records: note id, communication id, document id (+page), calendar_entry id, task id, expense id. All have Clio ids in cache.
- Clio web deep links (UNVERIFIED, need one manual check in a browser logged into app.clio.com):
  - Matter: `https://app.clio.com/nc/#/matters/{matter_id}` (confident the `/nc/#/matters/{id}` shape exists).
  - Notes / communications / tasks / calendar / documents: likely `.../nc/#/matters/{id}/notes`, `/communications`, `/tasks`, `/documents` tabs; a per-record permalink is UNVERIFIED (Clio's API returns no `web_url` in the fields we saw; matter.json has no url fields). Documents: `.../nc/#/documents/{id}` UNVERIFIED.
  - Fallback (ship this, it is also better): an in-app "source drawer" rendering the live record (note subject, unescaped detail, date, id, type), with the quote highlighted via `<mark>`, plus a secondary "Open matter in Clio" link to the matter URL (the one we are confident of, built from the account region host, not hardcoded case data).
- PDFs: yes. Cache is local (`.cache/clio/documents`, downloaded read-only by the dump script via 303 signed URL). Our own route `GET /api/docs/:id` streaming the file, viewer opens `<iframe src="/api/docs/:id#page=3">` or pdf.js with `page`. `#page=N` works in Chrome/Edge/Firefox built-in viewers (Safari less reliable); pdf.js is the safe choice and also lets us highlight the quote via text-layer search. Add `Content-Disposition: inline`, auth-gate the route (provider share must not expose arbitrary docs).
- Emails: Clio comms are one-paragraph summaries, no headers/attachments, so "open the email" = open the communication record; say so honestly in UI ("Clio log entry").

## Making citations real
1. LLM must return `{clioId, sourceType, quote, page}`; code looks up record by id (reject unknown ids), unescapes HTML (`html.unescape`), normalizes whitespace/case/quotes, and requires `quote` substring of `bodyText` (or of that PDF page). Fail: one retry with error, then drop claim or mark `quoteVerified:false` (only allowed for page refs).
2. Dates: LLM extracts only dates that appear inside the quote; code regex-parses the date out of the verified quote. Else `derivation: inferred` ("DOI + 94") shown with dashed chip. Structured dates (custom fields, due_at, start_at) are `clio-metadata`, computed by code, no AI.
3. Numbers (KPIs) computed by code from fields/expenses; AI gets none of the arithmetic.
4. Count "N of N claims verified" in the UI footer; one-line stat for the demo.

## Visual treatment
- Source chips (icon by type + date) inline on every claim/KPI; click opens a right-side drawer: record text with quote `<mark>`ed, metadata (type, Clio id, date, `derivation`), "Other sources" list (conflicts), and for PDFs a pdf.js pane jumped to page with highlight.
- Injuries panel: body silhouette or simple grouped cards (Left shoulder / Right shoulder / Head / Neck / Back / Knees), each with status badge (Surgery 2023-07-26 / Surgery recommended, unscheduled / Diagnosed), page chip "BoP p3". Hover shows quote.
- Provenance legend: solid chip = stated verbatim, dashed = inferred, grey = Clio metadata.

## AI vs code, model, cost
- AI: injury extraction from BOP + ortho/op reports, claim sentences with quotes, conflict-key proposals. Code: all dates from fields, substring validation, page mapping, conflict diff, links.
- Injuries pass: BOP ~4k tokens + op/ortho/radiology/ER ~8k tokens in, ~1.5k out. Sonnet: about $0.05 per run. Notes/comms digest (~15k tokens in, per docs/research/ai-pipeline.md) adds about $0.07. Cached by doc `updated_at`/hash, so about $0.15 per case total for this story incl. optional vision.

## Priority (5-hour build)
- MUST: source drawer + chips with `sourceType/sourceDate/quote` on every digest claim; substring validation; PDF-by-page proxy route + viewer at page; injuries cards from BOP with page + quote.
- SHOULD: "latest source wins + others" popover for coverage and specials; verified-claims counter; quote highlight in pdf.js.
- CUT: Clio per-record deep links (UNVERIFIED), vision on scans, body-map graphic, email header fidelity.
- Cheapest demo-able: static injuries cards driven by one LLM call over BOP pages 3-8 with page numbers, quote check, and an iframe `#page=` viewer; drawer for notes via plain text `<mark>`.

## Demo moment
Click "Left labral tear, surgery 7/26/2023" and the real Bill of Particulars opens at page 3 with the sworn sentence highlighted; click "Policy limits $100k/$300k" and see the 2026-09-09 note on top, with the 2023 "self-insured, no limit" note shown as superseded.
