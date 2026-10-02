# Swans Applied AI Hackathon

Time-boxed. Optimize for a working demo, not completeness. Be lean: skip process that doesn't protect the demo.

## Project (fill on day 1)

- Goal:
- Stack:
- Run / test / build:
- Deadline:

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
