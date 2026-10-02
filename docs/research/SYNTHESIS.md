# Research Synthesis

Sources: `user-stories.md`, `clio-api.md`, `ui-ux.md`, `ai-pipeline.md`, `pi-domain.md`, `competitive.md` (same folder). Items marked UNVERIFIED there must be checked against the live Sapini account before we rely on them.

## Positioning

> A live, source-linked briefing on a Clio PI case: staff get up to speed in 90 seconds, and treating providers get a curated, attorney-approved window. Every fact is one click from its source.

"AI summary with citations" alone is table stakes (Supio, EvenUp, Filevine, Litify, Clio "Catch up"). Our differentiators:
1. **Provenance on every tile.** No source, not shown.
2. **Curated provider share.** No AI product serves providers; lien portals show money and status but no digestion.
3. **Change feed.** "Since you last opened" computed from digest versions, without re-running AI.

Avoid: chat UI, Supio-style chronology/demand-letter pitch, unsourced prose, accuracy/HIPAA claims we can't back.

## Recommendation: one product, two views

- **Hero (demo 0:00-0:60): Attorney Brief.** Client photo + 4-sentence cited brief, 4 KPI tiles, "10 that matter" + action board, timeline strip, evidence drawer.
- **Closer (demo 0:60-0:90): Provider Share.** Attorney toggles items (AI pre-flags strategy), sees "14 shared / 212 withheld", sends link, provider view opens, attorney sees "opened".

The provider view is the larger gap per `competitive.md`, but the attorney brief is what makes the provider view credible. Build the brief first, keep the share thin and working.

## Feature cut (6h solo)

| Priority | Feature | Notes |
|---|---|---|
| MUST | Clio ingest + local cache | GET-only wrapper, `fields=` everywhere, 50 req/min limit, follow `meta.paging.next` |
| MUST | Source refs in the data model | every fact `{value, sourceType, clioId, sourceDate, quote, page?, clioUrl}` |
| MUST | Brief header + KPI tiles | worth (range; Clio custom field first, AI estimate labeled), coverage layers + status chip, firm spend (`/activities?type=ExpenseEntry`), last client contact |
| MUST | "10 that matter" + full-list toggle | ranking by LLM, validated against real ids |
| MUST | Action board | overdue / upcoming / waiting-on-others from tasks + calendar |
| MUST | Evidence drawer | click chip -> source text, quote highlighted, link to Clio |
| MUST | Share builder + provider view | allow-list preset, LLM flags, token link, view log |
| SHOULD | Injuries from scanned PDF | Sonnet on 20-25 page chunks, `{page, quote}`; pre-run and cache |
| SHOULD | "Since last open" diff | SQL over digest versions |
| SHOULD | Inferred stage rail | furthest stage with evidence, labeled "AI-inferred" |
| CUT | Webhooks (requires write scope), provider uploads, push alerts, patient attendance metric (fold into "last treatment event") | |

## Stack (recommended)

- Next.js (App Router) + TypeScript + Tailwind + shadcn/ui + Recharts; hand-built SVG for timeline / range bar / stage rail.
- SQLite (better-sqlite3 or Drizzle) for cache, digests, shares, view log. Demo on localhost ("localhost can win"). Move to Supabase only if we deploy.
- Claude: Haiku 4.5 for per-item extraction and the share redaction flags; Sonnet 5.5 for the PDF scan and the synthesis (cheaper and faster than Opus; upgrade only if quality is lacking).
- Est. cost ~$2-3 first digest, ~$0 re-open. Re-measure on Sapini with `count_tokens` for the submission.

## API constraints to design around

- Sonnet/Opus 5.5: no forced `tool_choice`, no prefill or temperature. Citations + structured outputs can't be combined in one call, so use a JSON schema with our own `{id, quote}` refs and a code validator (drop unknown ids, quotes must substring-match).
- KPIs computed in code from extracted values, never LLM arithmetic.
- Clio: token is valid 30 days, refresh never expires; doc download is a 303 to a signed URL (don't forward auth). Trial lasts 7 days, which is fine for today.

## Corrections to agent output

- `ai-pipeline.md` suggests a synthetic demo case. **Rejected**: rule 1 requires Sapini, live from Clio.
- `pi-domain.md` multipliers and non-NY SOL periods are from model memory. Fine for UI labels; don't state them as fact in the pitch.

## Open questions (answer from live Sapini data)

1. Are case value / coverage / policy limits structured custom fields? (Slide 11 shows "Estimated Case Value", "Medical Specials To Date", "Liability Assessment".)
2. Do emails live in `communications` or `conversation_messages`?
3. Does a contact have a photo/avatar field? If not, show initials.
4. How many pages are in the scans, and are they text-less? (affects cost + citations)

## Build order (next step: `/ecc:plan` against this)

1. Clio OAuth + smoke test (`clio-api.md` final section) -> confirm open questions.
2. `docs/contract.md`: Clio record types, digest schema with source refs, share model.
3. Ingest + cache -> extraction -> synthesis -> validator.
4. Attorney brief UI + evidence drawer.
5. Share builder + provider view + view log.
6. SHOULDs as time allows. Submission doc + clip by 3:15 PM.
