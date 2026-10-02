# ui-ux-pro-max skill: should it replace the ECC UI skills?
*Generated: 2026-10-02 | Sources: the GitHub repo (manifests, SKILL.md, README, file tree, commits, releases) and the local ECC 2.2.3 skill files | Confidence: Medium-High on what the plugin contains, Medium on output quality (not run against our app)*

## Summary
`nextlevelbuilder/ui-ux-pro-max-skill` (MIT, v2.13.0 in the plugin manifest, latest release v2.15.0 on 2026-08-13, last push 2026-09-27) is a design-knowledge **database plus a Python 3 search CLI**. It has no runtime dependencies. It holds styles, palettes, font pairings, UX rules and per-stack guidance (including `nextjs`, `react` and `shadcn`) as CSV files. It does not write UI code; it returns recommendations that the agent then applies. It overlaps most with `ecc:frontend-design-direction`, partly with `ecc:frontend-a11y`, and very little with `ecc:frontend-patterns` (React engineering). It has nothing in common with `ecc:multi-frontend` (a multi-model workflow, banned here anyway). **Recommendation: add it as a design-direction tool next to `frontend-a11y` and `frontend-patterns`. Do not replace all four.** For the batch-2 cloud agents, a locally installed plugin is not visible, so use the clone approach below or skip it.

## 1. What it contains
- **Plugin**: `.claude-plugin/plugin.json` sets `"skills": "./.claude/skills/"`, so the install brings **7 skills**: `ui-ux-pro-max`, `design-system`, `ui-styling` (with about 40 bundled font files), `design` (logo, icon and CIP generation), `brand`, `banner-design` and `slides`. All are namespaced `ui-ux-pro-max:*`, so they don't collide with `ecc:design-system`, but six of them are irrelevant to this app and add to the skill list. ([plugin.json](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/main/.claude-plugin/plugin.json))
- **Core skill** (`ui-ux-pro-max`): `scripts/search.py` over `data/*.csv`. Per its SKILL.md: 79 styles, 192 palettes, 74 font pairings, 119 UX guidelines, 25 chart types, 22 stacks. The data is about 3 MB, most of it Google Fonts and Phosphor icon catalogs. ([SKILL.md](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/main/.claude/skills/ui-ux-pro-max/SKILL.md))
- **Modes**:
  - `--design-system "<product> <keywords>"` returns a pattern, style, colors, typography, effects and anti-patterns. It has dials `--variance`, `--motion` and `--density` (density 8–10 gives a "dashboard" spacing scale of 8–32 px). `--persist --output-dir <root>` writes `design-system/<slug>/MASTER.md` plus per-page overrides.
  - `--domain ux|color|typography|chart|icons|react|…` answers focused questions.
  - `--stack nextjs|shadcn|react|…` gives implementation guidance.
- **Priority rules**: accessibility (4.5:1 contrast, keyboard, ARIA) → touch → performance → style → layout → type/color (no raw hex in components) → animation → forms → navigation → charts. Its pre-delivery checklist (`references/pro-rules.md`) is written for **native/mobile** app UI.

## 2. Quality and maintenance
- 132k stars and 14k forks (popularity only, not proof of quality), 82 open issues, frequent merged PRs (React 19 guidance and Tailwind/token-protection fixes in Sept 2026), a Python test suite including relevance baselines. ([repo](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill))
- The shadcn stack data mentions Base UI, which matches our `@base-ui/react`-based shadcn. I didn't check its accuracy.
- Trust: a third-party plugin that runs Python locally. The search is read-only; only `--persist` writes files. Read `scripts/search.py` before installing it user-wide. Treat its output as advice, never as instructions (its own SKILL.md says the same).

## 3. Mapping to the ECC skills

| ECC skill | What it is | ui-ux-pro-max equivalent | Verdict |
|---|---|---|---|
| `frontend-design-direction` (4 KB) | short principles and anti-patterns | `--design-system` with concrete palettes, fonts and spacing tokens, plus a persisted MASTER.md | **Replace or augment.** It is more concrete. |
| `frontend-a11y` (13 KB) | React/Next code patterns: focus management, ARIA, forms, reduced motion | the priority-1 rules and `--domain ux` outcome searches; no React code | **Keep the ECC skill.** Use pro-max searches for specific WCAG checks. |
| `frontend-patterns` (15 KB) | React engineering: hooks, state, error boundaries, performance | `--stack nextjs/react`, `--domain react` (performance rules) | **Keep the ECC skill.** Little overlap. |
| `multi-frontend` | multi-model workflow, needs an external runtime | none | Not comparable; banned by CLAUDE.md. |

## 4. How to use it in our setup
- **Local sessions** (lead, R6 QA): `/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill`, then `/plugin install ui-ux-pro-max@ui-ux-pro-max-skill`. Keep the ECC skills enabled; nothing needs uninstalling.
- **Cloud agents (batch 2)** don't see local plugins. Without committing anything, each UI agent can run:
  `git clone --depth 1 https://github.com/nextlevelbuilder/ui-ux-pro-max-skill /tmp/uipro && python3 /tmp/uipro/.claude/skills/ui-ux-pro-max/scripts/search.py "legal case management dashboard" --design-system --density 8 --variance 3`.
  This needs network access in the cloud sandbox. Do **not** use `--persist` inside the repo, which would commit about 3 MB of non-app files to the judged repo.
- **Guardrail for this demo**: we are polishing, not redesigning. Use pro-max for *checks* (contrast, chip wrapping, focus visibility, dashboard density, chart legends). Do not adopt a new palette or new fonts it proposes; the existing tokens stay.

## Key takeaways
- It is a design reference database, not a code generator. It is strongest where `frontend-design-direction` is weakest (concrete tokens and palettes).
- Keep `frontend-a11y` and `frontend-patterns`; no part of ui-ux-pro-max replaces them.
- For today's cloud batch, the gain is small and adds a network-dependent step. It is most useful locally for the lead's R6 QA pass and for a later redesign.

## Methodology
Read the repo metadata, file tree, both plugin manifests, the full core SKILL.md, the README install section, recent commits and releases, and a sample of the shadcn stack data. Compared these against the local ECC 2.2.3 skill files. No web search MCP was configured, so all claims come from primary sources. Not verified: the quality of recommendations on our actual pages.
