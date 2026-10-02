# Handoff: cloud fan-out results (docs/orchestration.md)

Date: 2026-10-02. Base: `main` @ `93c0724` (scaffold). Nothing merged into `main`; the lead merges locally.

## Branch status

All 11 task branches are pushed. Each passed its own Verify commands, and `git diff --stat origin/main...<branch>` touches only that task's owned paths. Branches were only tested in isolation: other tasks' modules were stubbed or mocked, so no cross-task integration has run.

| Task | Branch | Head | Commits | Verify | Notes |
|---|---|---|---|---|---|
| T01 Clio client + ingest + PDF | `task/t01-clio-ingest` | `02c56db` | 4 | typecheck + 30 tests | `next build` not run |
| T02 Deterministic digest | `task/t02-digest-core` | `177fe4b` | 2 | typecheck + 22 tests; all brief fixture numbers match | rule choices below |
| T03 AI pipeline | `task/t03-ai-pipeline` | `db06de7` | 2 | typecheck + 22 tests (SDK mocked) | not end-to-end until T01/T02/T04 merge |
| T04 DB + API routes | `task/t04-db-api` | `4bbe8c8` | 1 | typecheck + 14 tests + build | other libs mocked |
| T05 Share lib | `task/t05-share-lib` | `dd6df76` | 1 | typecheck + 49 tests (leak test per provider) | rebuilt clean from `main` |
| T06 Evidence drawer | `task/t06-evidence` | `51027ba` | 1 | typecheck + 5 tests + build | not opened in a browser |
| T07 Clio OAuth | `task/t07-oauth` | `2537355` | 1 | typecheck + 9 tests + build | real OAuth flow untested |
| T08 dump matter id | (already merged) | — | — | — | — |
| T09 Brief UI + landing | `task/t09-brief-ui` | `dfed9c8` | 3 | typecheck + 21 tests + build; screenshots at 1440/390 | not run against live API |
| T10 Share builder | `task/t10-share-builder` | `1239005` | 1 | typecheck + 8 tests | build only run in shared checkout, not on final branch |
| T11 Provider page | `task/t11-provider-page` | `bbdbb6d` | 1 | 7 tests + build; `/dev/provider` and `/s/bad` checked running | typecheck failed only on another task's file in the shared checkout |
| T12 README + submission | `task/t12-docs` | `b4e29da` | 1 | verify passes | — |

Suggested merge order (from orchestration.md): T02, T01, T04, T03, T05, T07, T06, T09, T11, T10, T12. After each: `npm run typecheck && npm test && npm run build`.

## What happened

- All 11 agents launched in parallel. Requested isolation was not honored for every agent: several shared `/home/user/swans-applied-ai-hackathon` and switched branches there, so commits landed on the wrong local branch and `npm ci` runs collided.
- The orchestrator told the affected agents (T02, T03, T04, T05, T10, T11) to move into their own worktrees (`/tmp/claude-0/<id>`) and push only owned paths. All did; the pushed branches are clean.
- Left over locally (never pushed, safe to delete): `stale/t05-shared-checkout`, which holds stray commits from T12, T02, T10 and T03. T03 asked for a branch reset its permission check had refused; it was not done. Deleting the branch covers it.
- T01's failed `rm -rf` left the shared checkout's `node_modules` partly deleted: run `npm ci` before using it.
- Worktrees under `/tmp/claude-0/t01..t11` exist only in the cloud container.

## Cross-task agreements made mid-run (outside the contract)

- `POST /api/share` accepts optional `attorneyNote` (≤1,000 chars) → `ProviderView.attorneyNote` (T10 → T04, T05: done).
- Coverage-limits toggle = synthetic id `"coverage:limits"` in `includedIds`; T05 offers it as a candidate (default off) and fills `coverage.layers` only when included (done).
- `GET /api/case` also returns `contacts: Contact[]` for the provider picker (T04: done), plus `aiCostUsd`, and `diffSince` when `?since=` is given.
- `POST /api/sync` returns 202 `{accepted, alreadyRunning, status}`.
- `/api/source` with `#pN` returns `documentText: {page, pageCount, text}`.
- T04's share-create drops any `includedIds` not offered by `buildCandidates` or marked hard-deny (fail closed). T05 offers `kpi:coverage`, `status:alive`, `status:stage`, `bill:own`, `coverage:limits`.
- T01 writes `document_texts.file_path` (absolute path of the cached PDF) via raw SQL; T04's documents route reads it.

## Integration checks for the lead

1. **Replies:** T05 `recordResponse(shareId, input, insert?)` takes an injected insert; confirm T04's respond route passes `repos().shareResponses` insert.
2. **Compare since:** T09 expects `/api/case?since=` to return the normal shape; T04 puts results in a separate `diffSince` field. Wire one to the other.
3. **Evidence drawer:** confirm T06 reads `/api/source`'s `documentText` as `{page, pageCount, text}`.
4. **T03 database writes:** it uses raw SQL on `getDb()` for `digests`/`extractions`/`ai_calls`; consider switching to T04 repos after merge. T04's `buildAndStoreDigest` also logs `ai_calls`, so check for double logging.
5. **Specials mismatch:** T02 puts it in `Kpi.note` + `conflicts` (no warnings in the deterministic digest); copy it into `meta.warnings` in T03/integration.
6. **Config (lead-owned files):**
   - `next.config.ts`: add `pdfjs-dist` to `serverExternalPackages` if the build fails to bundle it (T01).
   - `vitest.config.ts`: `esbuild: { jsx: 'automatic' }` so `.tsx` components can be tested (T11).
   - T06 loads the pdf.js worker on the main thread to get the build passing.
7. **Content hash:** T01 excludes etag from `contentHash` (the spec said include it) to avoid fake "changed" events. One-word change to `HASH_OMIT` in `src/lib/clio/normalize.ts` to revert.
8. **T09 story strip:** should stay 720px and scroll sideways at 390 wide but looked shrunk in the screenshot; check on a phone.

## Rule choices to review (T02)

- A phone call from a contact counts as a reply, so the overdue client task has no `waitingOn` (sample digest expected 1 request).
- `daysSilent` counts from the first unanswered request (93 for the Lakeview item; sample said 31).
- Treatment appointments are excluded from `next_deadline` and feed the client's next touchpoint instead.
- Future-dated items get neutral recency 0.5 in the top ten.
- The coverage KPI is `ok` when the written confirmation postdates the conflicting sources.

## Fixture and contract notes

- `fixtures/sample-digest.json` cites document 100060, which is missing from `fixtures/clio/documents.json`; T05 drops findings whose cited document is missing.
- T02's numbers differ from `fixtures/sample-digest.json` in places (see rule choices above); UI dev pages preview from the sample.
- `ProviderView.stage.label` is a required enum, so a withheld status shows "Not shared" with null dates.
- T05 ignores task `createdAt`/`completedAt` (seed time) for "last firm activity".

## Env vars

- New optional: `CLIO_REDIRECT_URI` (T07; default `http://127.0.0.1:3000/api/auth/clio/callback`), `CLIO_DOWNLOAD_HOSTS` (T01; extra allowed signed-URL host suffixes). Add both to `.env.example`.
- Already present and used: `DATABASE_PATH`, `APP_BASE_URL`, `SHARE_TTL_DAYS`, `SHARE_IP_SALT`, `FIRM_NAME`, `MODEL_EXTRACT`, `MODEL_SYNTH`, `MODEL_SCAN`, `ANTHROPIC_API_KEY`, `CLIO_FIXTURE_DIR`, `CLIO_MATTER_ID`, `CLIO_CLIENT_ID`, `CLIO_CLIENT_SECRET`, `CLIO_BASE_URL`, `CLIO_ACCESS_TOKEN`.

## Remaining lead steps (from orchestration.md)

Merge in order, live Sapini sync + digest, plan Phase 2 spot-checks, `/ecc:code-review`, `/ecc:security-scan`, delete `src/app/dev/`, hardcoding grep over `src/ scripts/`, real per-case cost into `docs/submission.md`, demo clip.
