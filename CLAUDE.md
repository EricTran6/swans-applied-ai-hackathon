# Swans Applied AI Hackathon

Time-boxed. Optimize for a working demo, not completeness. Be lean: skip process that doesn't protect the demo.

## Project

- Goal: Dashboard that digests a live Clio Manage case (matter "Sapini", personal injury) visually, for two audiences: (1) firm attorneys/staff get up to speed fast, (2) lien-treating medical providers get case visibility via a curated share. Not a chat box: visual digestion, no need to know what to ask.
- Stack: TBD
- Run / test / build: TBD
- Deadline: 2026-10-02, 4:00 PM HARD (repo committed + form + 90s clip). Submit early: order = presentation order. Top 7 pitch 4 min at 5:00 PM.

## Hackathon rules (judged from the repo; violating these disqualifies)

1. Everything runs on the Sapini matter, read LIVE from Clio via API. No hardcoded case data/features in the repo; judges screen for this.
2. Clio is READ-ONLY. Never call a Clio endpoint that creates/updates/deletes. Any persistence (shares, cache, view tracking) goes in our own DB outside Clio.
3. Repo is the submission. Commit small and often; all work committed by 4:00 PM.
4. Submission needs: repo, 90s Drive clip on Sapini, tech stack, AI models used + approx cost per case, notes on anything hardcoded/half-done. Keep these in `docs/submission.md` as we go.

## Product principles (from attorney/provider interviews)

- Every fact on screen is traceable: click through to the source note/email/doc; show where dates came from.
- Digest once, cache (keyed by Clio `updated_at`/hash); never re-run AI on every open. Track "what changed since last view".
- Two depth levels: 2-minute summary vs. drill into everything.
- Surface: case value + coverage KPIs, overdue/upcoming/waiting-on-others, recent activity (top ~10 of hundreds), last client contact, injuries from scanned PDFs (OCR/vision), firm spend (expenses).
- Provider view: share only status changes, bills, records. Never case strategy or unrelated confidential material. Attorney reviews/edits the share before sending; show opened/viewed status.
- Track per-case AI cost; we must report it.

## Workflow (ECC)

| Phase | Do | Skip when |
|---|---|---|
| Plan | `/ecc:plan <idea>`, wait for my "yes" | change touches one file |
| Build | `/ecc:feature-dev` (one feature) or `/ecc:orch-build-mvp` (from a spec) | - |
| Test | `tdd-workflow` skill, core logic only (scoring, parsing, transforms) | UI, glue code |
| Review | `/ecc:code-review` | trivial edits |
| Verify | `verification-loop` skill: build, types, tests | - |

Plan approval is typed by default. Use `/ecc:plan-canvas` (browser annotate + approve) only for large plans.

## I want to...

- Fix a broken build: `/ecc:build-fix`
- Fix a bug: `/ecc:orch-fix-defect`
- Clean up before demo: `/ecc:refactor-clean`
- Check for secrets/holes: `/ecc:security-scan`
- Find what ECC offers: `/ecc:ecc-guide`
- Session slow or long: `/ecc:context-budget`, then `/ecc:save-session`; resume with `/ecc:resume-session`

## Parallel agents

Launch independent agents in ONE message with multiple Agent calls. Sequence dependent work. Cap at ~4 concurrent.

1. Write `docs/contract.md` (shared types/API) before fanning out.
2. Brief each agent with `docs/agent-brief.md`: goal, owned paths, verify command, report format.
3. Disjoint file ownership. Overlap risk -> `isolation: "worktree"`, merge one at a time.
4. Agents report <=10 lines. I run build/tests myself before calling it done.

Good splits: frontend / backend / prompts+data; research / scaffold; review / security / tests on finished code.

## Agent routing

- Search code: `Explore`
- Design: `ecc:planner`, `ecc:architect`
- Build/type errors: `ecc:build-error-resolver`
- After writing code: language reviewer (`ecc:typescript-reviewer`, `ecc:python-reviewer`, ...) + `ecc:security-reviewer`
- UI testing: `ecc:e2e-runner`
- Final docs: `ecc:doc-updater`

## Definition of done

Builds green, core logic tested, `/ecc:code-review` clean, `/ecc:security-scan` clean, README has run instructions.

## Do not use (not worth it here)

instincts/continuous-learning, memory vault, `multi-*` commands, `orch-pipeline`, `loop-*`, `santa-*`, `gan-*`.

## Rules

- Simplest thing that demos. No speculative abstractions or unrequested features.
- Secrets only in `.env` (gitignored); keep `.env.example` current.
- Commit small and often.
- Don't load skills or read big files "just in case".

## Day-1 checklist

- [ ] Fill Project block above
- [ ] Copy matching language pack into `~/.claude/rules/ecc/` (from the plugin's `rules/<lang>`)
- [ ] Set language reviewer names in Agent routing
- [ ] Fill `docs/contract.md`
