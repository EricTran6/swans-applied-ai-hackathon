# Merge agent: review batch 2 and decide what lands on `main`

You review six pushed branches, decide **merge / hold** for each, and merge the ones that pass into `main`. Repo: `github.com/EricTran6/swans-applied-ai-hackathon`. All branches were cut from `origin/main` at `0d3fcb4`. Read `CLAUDE.md` first; its hackathon rules override everything here. Deadline: `main` final by **3:30 PM PT**.

## Branches, in merge order

| # | Task | Branch @ head | Owned paths |
|---|---|---|---|
| 1 | R5 share lib fail-closed | `task/r5-share-lib` @ `91e025b` | `src/lib/share/**` |
| 2 | R1 digest quality | `task/r1-digest-quality` @ `e67d68d` | `src/lib/digest/**` |
| 3 | R4 share builder + preview route | `task/r4-share-builder` @ `1e2e670` | `src/components/share/builder/**`, `src/app/api/share/preview/**` |
| 4 | R2 brief header, KPIs, tokens | `task/r2-brief-header` @ `8fb85aa` | `src/components/brief/{Header,KpiRow,BriefView,BriefPanels,primitives}.tsx`, `header-lib.ts`, `src/app/globals.css` |
| 5 | R3 story strip + lists | `task/r3-strip-layout` @ `d8c1999` | `src/components/brief/{StoryStrip,TopTenAndActions,InjuriesAndTable}.tsx`, `lib.ts` |
| 6 | R8 landing dashboard | `task/r8-landing` @ `d1f8d6b` | `src/app/page.tsx`, `src/components/home/**`, `src/app/api/matters/overview/**` |

If a branch head differs from the SHA above, review the new head and say so in your report.

## Gates: a branch merges only if all pass

1. **Clio read-only.** The diff adds no Clio call other than GET.
2. **No hardcoded case data.** `grep -rniE "sapini|1811202578|abramov|katzman|kwan|sportscare" src/ scripts/` is empty, and no real amounts, dates or names are baked into rules. Tests use the synthetic `fixtures/` ("Jane Doe") only.
3. **Owned paths only.** `git diff --name-only origin/main...origin/<branch>` stays inside the row above. No changes to `package.json`, the lockfile, `tsconfig.json`, `next.config.ts`, `src/lib/types.ts`, `src/components/ui/**`. No `src/app/dev/**`.
4. **No leak to providers** (R5, R4): non-preset categories (liability, firm expense, client PII, valuation, notes, other providers' bills) never reach a `ProviderView`, even when every id is sent.
5. **Green after merge.** `npm run typecheck && npm test && npm run build` passes on `main` with this branch merged on top of the ones before it.
6. **No blocker-level bug** from your reading of the diff (wrong logic, crash, security hole, broken a11y on the main flow).

A failing gate → **hold** that branch, skip it, and keep going with the rest. Should-fix and nit findings do not block a merge; list them.

## Procedure

```bash
git fetch origin
git checkout main && git pull --ff-only origin main
npm ci
npm run typecheck && npm test && npm run build      # baseline must be green
```

For each branch in order:

```bash
git diff --stat origin/main...origin/<branch>        # gate 3
git diff origin/main...origin/<branch>               # read it; gates 1, 2, 4, 6
git merge --no-ff origin/<branch> -m "merge: <task id> <slug>"
npm run typecheck && npm test && npm run build       # gate 5
```

- Gate 5 fails → `git merge --abort` if still in progress, otherwise `git reset --hard HEAD~1`, then mark the branch **hold**.
- A merge conflict → resolve it only if it is mechanical (imports, adjacent lines). If both sides changed the same logic, abort and hold.
- Do not edit code beyond conflict resolution. Do not rewrite or force-push any branch. Never touch Clio.

When all six are decided and `main` is green: `git push origin main`. If anything was held, still push the merged ones.

Do **not** run `npm run digest`; the lead rebuilds the live digest locally (it needs `.env` and Clio access).

## Known issues: decide, don't fix

Each one either changes your verdict or goes in the follow-up list for the lead.

- **R4/R5 create route.** `src/app/api/share/route.ts` (create, not owned by any branch) only drops hard-denied ids. Check whether R5's `buildProviderView` already ignores non-preset ids server-side (R5's all-ids leak test claims it does). If yes → follow-up only. If a liability/firm-expense/PII value can reach a stored share → treat as gate 4 failure for R4 and report it as a blocker.
- **R2 not fully wired.** `src/components/brief/MatterBrief.tsx` still shows "Last synced never" (line ~129) and doesn't pass `onRefresh` to `BriefView`. Not a reason to hold R2; list as follow-up.
- **R1 thread grouping** matches on the first two content words cut to five letters, looser than the brief. Hold only if it collapses clearly unrelated fixture items; otherwise follow-up.
- **R1 waiting-on** still needs an open task naming the contact. Follow-up.
- **R1 changed one existing test** (an item moved from upcoming to waiting-on). Accept only if it matches the brief's rule "don't repeat waiting-on items under upcoming".
- **R2 and R3 both edit `src/components/brief/`** (disjoint files) and both changed token usage (`ink-3` → `ink-2`, `--ink-3` darkened). Expect a clean merge; check the build.
- **R4 preview:** `ProviderViewCard` renders a second `<main>`. Follow-up.
- **R8** keeps its own 5-minute matter-list cache, separate from `/api/matters`. Acceptable.
- No branch was checked in a browser; visual QA is the lead's R6 pass after your merges.

## Report (reply with exactly this)

```
branch | verdict (merged / held) | gates failed | blockers | follow-ups for lead
```

Then at most 8 lines: final `main` SHA, whether it was pushed, test count from the final `npm test`, and anything the lead must do before R6 (always include: run `npm run digest -- --no-sync`, wire `MatterBrief.tsx`).
