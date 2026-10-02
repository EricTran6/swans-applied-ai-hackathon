# Code review handoff: batch 2 (R1–R5, R8)

You are a **read-only code reviewer**. Review six pushed task branches before the lead merges them into `main`. Do not edit, commit, merge or push. Report findings only.

Repo: `github.com/EricTran6/swans-applied-ai-hackathon`. Every branch was cut from `origin/main` at `0d3fcb4`. Briefs: `docs/orchestration-2.md`. Rules: `CLAUDE.md`, `docs/contract.md`, `src/lib/types.ts`.

## Branches (merge order: R5, R1, R4, R2, R3, R8)

| Task | Branch @ head | Scope (all files stay in owned paths) | Agent-reported verify |
|---|---|---|---|
| R5 share lib fail-closed | `task/r5-share-lib` @ `91e025b` | `src/lib/share/**` (9 files, +237/−22) | typecheck ✓, share 64/64, full 228/228 |
| R1 digest quality | `task/r1-digest-quality` @ `e67d68d` | `src/lib/digest/**` (6 files, +356/−42) | typecheck ✓, digest 37/37, full 233/233 |
| R4 share builder | `task/r4-share-builder` @ `1e2e670` | `src/components/share/builder/**`, new `src/app/api/share/preview/route.ts` (+test) (6 files, +508/−112) | typecheck ✓, 24 tests, build ✓, full 234 |
| R2 brief header | `task/r2-brief-header` @ `8fb85aa` | `src/components/brief/{Header,KpiRow,BriefView,BriefPanels,primitives}.tsx`, new `header-lib.ts` (+test), `src/app/globals.css` (8 files, +316/−76) | typecheck ✓, brief 32, build ✓ |
| R3 strip layout | `task/r3-strip-layout` @ `d8c1999` | `src/components/brief/{StoryStrip,TopTenAndActions,InjuriesAndTable}.tsx`, `lib.ts` (+test) (5 files, +468/−167) | typecheck ✓, brief 29, build ✓ |
| R8 landing | `task/r8-landing` @ `d1f8d6b` | `src/app/page.tsx`, new `src/components/home/**`, new `src/app/api/matters/overview/{route,build}.ts` (+test) (12 files, +1060/−19) | typecheck ✓, 18 tests, build ✓ |

Agents did not have the `ecc:*` skills; every "review" so far was the agent re-reading its own diff. No branch has been checked in a browser.

## Setup

```bash
git fetch origin
npm ci
for b in r5-share-lib r1-digest-quality r4-share-builder r2-brief-header r3-strip-layout r8-landing; do
  git diff --stat origin/main...origin/task/$b
done
```

Re-run each branch's verify yourself (do not trust the reported numbers):

```bash
git checkout --detach origin/task/<branch>
npm run typecheck && npm test && npm run build
```

Then check that the branches combine: a throwaway local merge in the order above, followed by `npm run typecheck && npm test && npm run build`. R2 and R3 both touch `src/components/brief/` (disjoint files) and both changed token usage; watch for conflicts or type breaks between them. Never push the merge.

## Disqualifying checks (run on every branch)

1. **Clio is read-only.** No new Clio call other than GET. `grep -rnE "method:\s*['\"](POST|PUT|PATCH|DELETE)" src/lib/clio src/app/api` should show only our own routes, never Clio.
2. **No hardcoded case data.** `grep -rniE "sapini|1811202578|abramov|katzman|kwan|sportscare" src/ scripts/` must be empty. Look also for real amounts, dates or provider names baked into rules or regexes (R1's category/milestone keyword lists and R5's custom-field buckets are the likeliest places).
3. **Owned paths only.** No changes to `package.json`, the lockfile, `tsconfig.json`, `next.config.ts`, `src/lib/types.ts` or `src/components/ui/**`. No `src/app/dev/**`.
4. **No secrets, no logged record text** (R8's overview route especially).

## What to scrutinize per branch

**R5 (security-critical; review first)**
- `roleLabel` in `scope.ts`: balanced parens, 60-char cap, never splits inside parens.
- `templateCorrespondence` / `formatShortDate`: no timezone off-by-one; undated correspondence falls to `internal_comms` (fail closed).
- Provider view caps recipient updates at 5 newest; stage/coverage updates are kept unconditionally. Confirm no other provider's update can slip through the "unscoped" path.
- `customFieldCategory`: unknown names → excluded. Check the keyword list can't misfile a PII field as shareable.
- Leak test: passes **all** candidate ids for every fixture provider and asserts no valuation, liability, firm expense, PII values, note text or other provider's bill in the serialized view. Confirm the assertions actually look for the values, not just keys.
- Step 0.4 decision (ACCEPT: providers never see pleading-derived findings) is pinned by a test.

**R1**
- Communications are never milestones; ≤12 milestones; same kind within 14 days collapses to the earliest.
- Ordered category rules with `RE:/FW:/Fwd:` stripped and contact names removed; replies inherit their thread's category.
- Thread grouping is **looser than the brief**: first two content words cut to five letters, plus counterparty. Judge the false-merge risk (two unrelated items sharing a prefix being collapsed out of the top ten).
- Waiting-on window = later of last reply and now − 180d. Note: items still need an open task naming the contact, and a phone call counts as a reply. Flag whether that defeats the brief's "fresh unanswered request" case on real data.
- One existing test expectation was changed (an item moved from upcoming to waiting). Confirm that is the intended rule, not a test bent to pass.

**R4 (security-relevant)**
- `POST /api/share/preview`: same zod body as create, no persistence, no token, `Cache-Control: no-store`, filters ids to offered ∩ not hard-denied ∩ `DEFAULT_PRESET.allow ∪ optIn`. Check auth parity with the create route and that errors don't echo record text.
- `logic.ts`: liability, firm expense and client PII can never be toggled on, category-switched or sent.
- Recipient scoping: other providers' items are locked and folded; completed requests hidden and counted as withheld. Counter math still holds.
- 300 ms debounce: no request storm, stale responses can't overwrite newer ones.
- **Known gap outside R4's paths:** `src/app/api/share/route.ts` (create) only drops hard-denied ids, so a hand-crafted request could include a liability/firm-expense/PII id. Confirm whether R5's lib-level filtering already blocks this end to end; if not, report it as a blocker for the lead.
- **Known a11y issue:** `ProviderViewCard` renders `<main>`, so the preview adds a second `<main>` landmark.

**R2**
- `header-lib.ts`: warning grouping, API-error JSON stripped from visible text, sync/built label, model dedupe.
- Coverage cap fallback chain (range cap → coverage KPI → BI layer → largest live layer): is "largest live layer" a sound cap, or could it overstate coverage?
- **Not wired in:** `MatterBrief.tsx` (not R2's file) still renders "Last synced never" at line 129 and doesn't pass `onRefresh` to `BriefView`. Report as a lead follow-up.
- `globals.css`: `--ink-3` darkened; global `:focus-visible` and `prefers-reduced-motion` rules don't break other pages.

**R3**
- `stripLayout`: gap-compressed scale is monotonic and caps empty stretches >120d at 8%; no two label boxes intersect; <8px dots cluster; "Today" never covers a label. Read the tests for real geometry checks, not just counts.
- `ResizeObserver` cleanup, SSR safety (no `window` at render), full-bleed CSS doesn't cause horizontal page scroll at desktop widths.
- Keyboard access on dots, `aria-expanded`, Escape closes the tooltip.
- Known: at 1280px two long adjacent labels can cross the next row's connector line.
- No raw hex colors.

**R8**
- Overview route makes exactly one Clio call (matter list); everything else from our DB. It has its **own** 5-minute cache, separate from `/api/matters`. Flag if that matters.
- 401/502 behaviour matches `/api/matters`; no record text logged.
- Response type lives in `build.ts`, not `types.ts`. Extra fields beyond the brief: `shares.recent`, `newSinceOpen: null` when never opened, revoked shares excluded, "due in 7 days" recomputed against today.
- **Digest now** button: `POST /api/sync` then polls; check the poll stops on success, error and unmount.
- `FIRM_NAME` read safely (server-only, no client env leak).
- Landing copy is static product text, no case data.

## Report format

One table, then at most 10 lines of notes:

`branch | severity (blocker / should-fix / nit) | file:line | finding | suggested fix`

Order by merge order, blockers first within each branch. End with a one-line verdict per branch: **merge**, **merge after fix**, or **hold**, and whether the combined merge builds and tests green.
