# Plan: Comprehensive CLAUDE.md for ECC usage

**Complexity**: Small (docs only, no code)

## Summary
Expand [CLAUDE.md](../../CLAUDE.md) so any session (and any parallel subagent) knows exactly when and how to use ECC during the hackathon. "Comprehensive" must not mean "long": CLAUDE.md loads every session, and ECC's `rules/common` (10 files) is already always-loaded. So the approach is a **short core CLAUDE.md that routes to on-demand detail**, not one giant file.

## Requirements
- Cover the full ECC workflow: plan -> test -> implement -> review -> verify -> remember
- Make parallel-agent launches fast and safe (briefs, ownership, worktrees, contract)
- Stay stack-agnostic until the challenge is announced; one small block to fill in later
- Avoid duplicating what ECC rules/skills already say

## Design decisions (resolved)
1. **Structure**: core CLAUDE.md (~100 lines) + `docs/` playbooks loaded on demand.
2. **Phase strictness**: lean. Plan gate only for multi-file work, TDD only for core logic.
3. **Plan approval**: typed "yes" by default; Plan Canvas for big plans.

## Proposed CLAUDE.md sections
| # | Section | Content | Where detail lives |
|---|---|---|---|
| 1 | Project block | Goal, stack, run/test/build commands, deadline (fill on day 1) | inline |
| 2 | Phase workflow | Mapping of each phase to an ECC command: `/ecc:plan` -> (`tdd-workflow` for core logic) -> implement -> `/ecc:code-review` -> verify (`/ecc:verification-loop`) | inline, 1 table |
| 3 | Command decision table | "I want to..." -> exact command/agent (build, fix, refactor, scan, resume) | inline |
| 4 | Parallel agents | Launch rules, brief template, file ownership, worktrees, concurrency cap | brief template in `docs/agent-brief.md` |
| 5 | Plan gate | When to plan, when to use `/ecc:plan-canvas`, what counts as approval | inline |
| 6 | Agent routing | Which ECC agent per job, per-language reviewers (filled once stack known) | inline |
| 7 | Quality gates | Definition of done: build green, tests for core logic, review, security scan | inline |
| 8 | Do-not list | Things to skip in a hackathon (instincts, memory vault, multi-model, orch-pipeline, loops) | inline |
| 9 | Context hygiene | `/ecc:context-budget`, `/ecc:save-session`, `/ecc:resume-session`, avoid loading skills "just in case" | inline |
| 10 | Day-1 checklist | Fill project block, install language rules pack, `.gitignore`/`.env.example`, `docs/contract.md` | inline |

## Files to Change
| File | Action | Why |
|---|---|---|
| `CLAUDE.md` | UPDATE | Restructure into the sections above, keep under ~100 lines |
| `docs/agent-brief.md` | CREATE | Reusable brief template for parallel agents (goal, owned paths, contract, verify, report format) |
| `docs/contract.md` | CREATE | Empty template for shared interfaces, filled before fan-out |
| `.gitignore` | CREATE | `.env`, `node_modules`, etc. |
| `.env.example` | CREATE | Placeholder for keys |

## Tasks
1. Verify claims about ECC commands/agents against the installed plugin (names exist, descriptions match) so CLAUDE.md never points at a missing command. **Validate**: each referenced command/agent appears in the plugin cache.
2. Draft the new CLAUDE.md. **Validate**: line count <= ~100; no section duplicates `rules/common`.
3. Write `docs/agent-brief.md` and `docs/contract.md` templates.
4. Add `.gitignore` and `.env.example`.
5. Dry run: a trivial parallel fan-out (two agents, disjoint files) to confirm the rules produce usable briefs. **Validate**: no file collisions, summaries returned.
6. First commit.

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| CLAUDE.md bloats and costs context every session | High | Hard line budget; push detail to docs/ |
| References a command that doesn't exist or was renamed | Medium | Task 1 verification; plugin is pinned at 2.2.3 |
| Parallel rules too rigid for a fast-moving hackathon | Medium | Keep rules as defaults with an explicit "skip if trivial" escape |
| Stack-specific guidance goes stale once challenge is announced | Low | Single project block + day-1 checklist |

## Acceptance
- [ ] CLAUDE.md under ~100 lines, covers all 10 sections
- [ ] Every referenced command/agent verified to exist
- [ ] Brief template and contract template in `docs/`
- [ ] Dry-run fan-out succeeded
- [ ] Committed
