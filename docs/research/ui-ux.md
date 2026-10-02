# UI/UX Design Direction: PI Case Brief Dashboard

Track: design direction. Stack assumed: Next.js + Tailwind. Time-boxed; everything below is cheap to build.

Sources read: ECC dashboard-builder, frontend-design-direction, design-system, make-interfaces-feel-better, taste (video-only, not applicable), frontend-patterns. The `dataviz` skill has no SKILL.md on disk (it is a built-in skill), so its rules are applied from general practice below.
Web: [AYDesign citation UI patterns 2026](https://www.aydesign.ai/blog/ai-citation-source-ui-patterns-2026), [Perplexity citations teardown](https://aiuxplayground.com/teardowns/perplexity/citations/), [shadcn.io inline citation](https://www.shadcn.io/ai/inline-citation), [assistant-ui inline citation](https://www.assistant-ui.com/elements/inline-citation).

## 1. Guidance that applies (extracted)

- dashboard-builder: start from the operator's questions, not layout. Every panel has a title, unit, and meaningful status color; cut vanity panels. Our questions: "Where does this case stand? What is overdue / next / waiting on others? What changed? What is it worth? What do I click to prove it?"
- frontend-design-direction: pick a tone explicitly. For a repeat-use legal tool: dense, quiet, scannable, ONE memorable detail. First viewport is the real product, not a hero. No cards inside cards. No purple gradients.
- make-interfaces-feel-better: `tabular-nums` on every number; concentric radius; no `transition: all`; `text-wrap: balance/pretty`; 40px hit areas; subtle image outline; enter animations opacity + 4px translateY, exits shorter.
- design-system slop checklist: gratuitous gradients, glass cards, generic sans with no personality, random hex values (use tokens), missing empty/loading states.
- dataviz (general): one hue family for emphasis plus neutrals; color encodes status only, never decoration; direct labels over legends; sparklines/bars over pies; always show units and "as of" date; accessible contrast (never color-only status, add icon or text).

## 2. Core design idea (the "memorable detail")

**Every fact on screen carries a source chip, and every chip opens the source in a right-side "Evidence" drawer with the cited passage highlighted.** The whole product is "nothing is asserted without a receipt." Attorneys distrust AI summaries; this is the answer, and it is also the direct reply to the "if a date is on screen I need to see where it came from" requirement.

Second idea: **the 90-second brief is a narrative top strip + a ranked "10 that matter" list**, not a grid of widgets. Existing tools (Clio, CasePeer, Lawmatics) all show counts and tabs; we show a *judgment*.

## 3. Attorney view: first screen ("90-second brief")

Desktop 1440 wide, single scroll-free viewport, 12-col grid. Left rail is thin (matter switcher + sections), right is the Evidence drawer (hidden until a chip is clicked).

```
+--------------------------------------------------------------------------------------------+
| [rail]| Rivera v. Allstate  MVA 03/14/26 | Stage: Treating | SOL 03/14/28 (528d) | [Since last open: 7] [Share view] |
| Matters|--------------------------------------------------------------------------------------------|
| Brief  | [PHOTO]  Maria Rivera, 34         BRIEF (AI, 4 sentences, each claim has a chip)        |
| Timeline| 96px    Last contact 3d ago [ok]    "Rear-ended at 40 mph; ER same day [C1]. MRI shows   |
| Money  |  round   Lives Tampa, works RN     L4-L5 herniation [C2]. Treating w/ ortho, PT 2x/wk.   |
| Docs   |                                    Policy limits demand blocked on missing wage record    |
| Tasks  |                                    from employer [C3]. Next hard date: IME 10/21 [C4]"   |
|        |--------------------------------------------------------------------------------------------|
|        | KPI: CASE WORTH      | COVERAGE             | FIRM SPEND        | LAST CLIENT CONTACT      |
|        | $185k - $310k        | $100k BI / $50k MP   | $4,820            | 3 days ago (call)        |
|        | range bar+confidence | bar: meds $42k vs lim| costs vs median   | tick-timeline 90d dots   |
|        | [src chip]           | gap shown in amber   | sparkline         | [src chip]               |
|        |--------------------------------------------------------------------------------------------|
|        | THE 10 THAT MATTER (ranked, from 312 entries)       | ACTION BOARD                         |
|        |  1 10/02 Adjuster denied MP claim        [email]    |  OVERDUE (2)    red                  |
|        |    why it matters: coverage gap $8k      [chip]     |   - Wage records from employer  4d   |
|        |  2 09/28 MRI: L4-L5 herniation           [doc]      |   - Sign HIPAA release (client) 9d   |
|        |  3 09/25 Client missed PT 2 visits       [note]     |  UPCOMING (3)   amber                |
|        |  ...  (expand to 10; "show all 312" link)           |   - IME 10/21  - Demand draft 10/30  |
|        |  filter chips: All | Medical | Insurance | Client   |  WAITING ON OTHERS (3) blue          |
|        |                                                     |   - Adjuster (Allstate)  12d silent  |
|        |                                                     |   - Dr. Patel records  req'd 10d ago |
|        |--------------------------------------------------------------------------------------------|
|        | TIMELINE STRIP: incident -- ER -- MRI -- retained -- ... -- NOW -- IME -- SOL (events as dots, |
|        | lane per type; click dot -> drawer)                                                       |
+--------------------------------------------------------------------------------------------+
```

Rules for this screen:
- Header sentence block is generated but every sentence has `[C#]` chips. If a claim has no source, it is not shown (hard rule; supports trust).
- "Since last open" pill in the header; click filters the 10-list and timeline to new items with a small blue dot on each (store last-open timestamp client-side).
- Action Board is three columns of the user's own words: Overdue / Upcoming / Waiting on others. Waiting rows show "who" + "days silent" as the key number. Color: red / amber / blue, always with icon + text.
- The 10-list rows: date, one-line title, type icon, a "why it matters" line (AI, short), source chip. Ranking is by materiality (money, deadlines, liability, medical turning points, adverse actions).
- Photo: round or rounded-square 96px with 1px neutral inset outline, placeholder initials if absent. Appears in header AND stays as small avatar in the sticky bar when scrolling.

## 4. Drill-down

Click anything (a chip, a row, a timeline dot, a KPI) -> **right Evidence drawer (480px, resizable), main view stays visible behind it.** No page navigation. This is the key difference from Clio/CasePeer ("detail one jump away").

```
+--------------------------------------+
| EVIDENCE                      [x] [↗ Open in Clio] |
| Email  |  Adjuster J. Smith -> firm  |
| 10/02/26 9:14 AM  | thread 4 msgs    |
|--------------------------------------|
| ...we are unable to extend Med-Pay   |
| beyond the $2,000 sub-limit ...      |  <- cited span highlighted yellow
|--------------------------------------|
| Used for:  [Coverage gap $8k] [Brief C3] |
| Related:   Policy dec page; Demand ltr |
| < prev source      next source >     |
+--------------------------------------+
```
Full-page drill (tabs) only for: Timeline (full, filterable, virtualized 300+ rows), Money (meds ledger vs coverage), Docs. Same chips and drawer work everywhere.

## 5. Provider-facing share view (lean)

Separate route (`/share/[token]`), narrow single column (max 720px), no internal strategy, no case worth, no firm spend. Light chrome, firm logo, "Last updated" stamp.

```
+--------------------------------------------------+
| [Firm logo]            Shared with: Dr. Patel    |
| Maria Rivera  (DOB shown only if needed)          |
|--------------------------------------------------|
| CASE STATUS   ● Active - Treatment phase         |
|   stage rail:  Intake > TREATING > Demand > Neg > Resolved |
|   "Last firm activity: 2 days ago"   [alive: green]|
|--------------------------------------------------|
| WHAT WE NEED FROM YOU (2)             <- top, big|
|  [ ] Updated chart notes since 08/01   due 10/10 |
|      [Upload]  [Mark sent]                        |
|  [ ] Itemized bill (CPT codes)         due 10/15 |
|--------------------------------------------------|
| COVERAGE (what's available for your bill)         |
|  Med-Pay $2,000 remaining $0  |  BI limit $100k  |
|  simple bar, plain-language note                  |
|--------------------------------------------------|
| Your balance on file: $12,400  | Next review 10/21 |
+--------------------------------------------------+
```
Principles: the "alive?" signal is a single green/amber/red dot + plain phrase ("Active, last touched 2 days ago"). Requests are checkable, dated, and the largest element. Minimal jargon. Toggle in the attorney view "Preview as provider" for the demo (cheap, impressive).

## 6. Source / provenance interaction pattern

Based on current AI-citation UX (claim-level attribution, hover preview, deep-link to passage, degrade visibly when weak):

1. **Chip anatomy:** `[icon · Type · date]` e.g. mail icon + "Email · 10/02". Compact 22px pill, mono-ish 11px text, neutral gray, tinted by type icon only. Perplexity-style "+N" when a claim has multiple sources.
2. **Hover (150ms delay):** popover with title, author, date, 2-line excerpt with the cited words bold. No navigation.
3. **Click:** opens Evidence drawer scrolled to the cited span (highlighted). Secondary action "Open in Clio" deep link.
4. **Dates specifically:** any date rendered by `<SourcedDate>` = date text with dotted underline + chip on hover. This satisfies "if a date is on screen I need to see where it came from" everywhere, including the timeline and Action Board.
5. **Confidence:** if value is inferred (e.g. case worth), show "Estimated" tag + the inputs on hover. Missing source = value rendered gray with "unverified" tag, never silently shown as fact.
6. **Keyboard:** `j/k` through sources in drawer, `Esc` closes, `/` search.
7. **Data model requirement (hand to the data track):** every fact object = `{value, sourceId, sourceType, sourceDate, quote/span, clioUrl}`. Without `quote` the highlight and hover excerpt cannot work.

## 7. Visual style

**Tone:** "calm legal-editorial": a serif for case-level headings gives gravitas (trial attorneys), a clean sans for data. Dense but airy; looks like a well-designed brief, not a SaaS admin panel.

**Type**
- Headings/brief text: `Source Serif 4` (or Newsreader), 600 for titles, 400 for brief paragraph at 17px/1.5.
- UI/data: `Inter` (or Geist Sans), 13-14px base; numbers `tabular-nums`.
- Mono 11px for chip metadata (`Geist Mono`).
- Scale: 11 / 13 / 15 / 17 / 22 / 32 (KPI value).

**Color tokens (CSS variables, light default, dark optional)**
```
--bg:        #FAF9F6   (warm paper)      --bg-elev: #FFFFFF
--ink:       #14181F   --ink-2: #4A5362  --ink-3: #8A93A3
--line:      #E7E4DC   (hairline borders)
--accent:    #1F3A5F   (deep navy: links, selection, primary)
--danger:    #B42318   --danger-bg: #FEF3F2   (overdue)
--warn:      #B54708   --warn-bg:   #FFFAEB   (upcoming, gaps)
--info:      #175CD3   --info-bg:   #EFF4FF   (waiting on others)
--ok:        #067647   --ok-bg:     #ECFDF3   (healthy / alive)
--hl:        #FFF1A8   (source-highlight yellow, the signature "marker" color)
```
Status colors used only for status. Everything else is ink + paper + one navy accent. The yellow highlighter is reserved for provenance, so it becomes a recognizable signature.

**Density & shape:** 8px grid; row height 40px in lists; 12px radius on panels, 8px nested (concentric); borders 1px `--line`, shadow only on drawer/popover (`0 8px 24px rgb(20 24 31 / .08)`). No card-in-card: use dividers inside panels.

## 8. Component library recommendation

**shadcn/ui (Radix + Tailwind) as base + Recharts via shadcn `chart` wrapper + a few hand-built SVG/CSS pieces + `cmdk` + `framer-motion` (sparingly).**

Why:
- shadcn/ui: components are copied into the repo, so you own and restyle them to the tokens above in minutes; Radix gives accessible Popover/HoverCard (chip previews), Sheet (Evidence drawer), Tabs, Tooltip, Command for free. Fastest path to a non-generic look because it isn't a locked theme.
- Recharts (through shadcn `chart`): enough for sparklines, bars, the coverage-vs-meds bar. Composable, themable with the CSS vars.
- Hand-build in plain SVG/divs: the timeline strip (a lane-per-type dot plot is ~80 lines and looks better than any chart lib), range bar for case worth, stage rail. These are the differentiators.
- Skip Tremor: fast to a *generic* analytics-dashboard look, which is exactly what the judges have seen; harder to push to our editorial feel. Fine for throwaway KPI cards only if short on time.
- Extras: `lucide-react` icons, `date-fns`, `@tanstack/react-virtual` for the 300-entry timeline, shadcn "inline-citation"/HoverCard pattern as the chip base.

## 9. Five cheap "feels premium" polish items

1. **Count-up + skeleton-to-content for the brief:** stream the 4 brief sentences in with a 12px fade-up stagger (60ms apart) and let chips pop in last; KPI numbers count up 400ms with `tabular-nums`. Sells "AI digested this" in the demo.
2. **Highlighter animation in the Evidence drawer:** when it opens, the yellow highlight wipes across the cited span (CSS background-size 0 -> 100%, 500ms). Signature moment, ~10 lines of CSS.
3. **Cmd-K command palette** (shadcn Command): jump to any matter, document, or "overdue tasks". Instantly reads as a serious pro tool.
4. **"Since last open" diff glow:** new/changed items get a small blue dot and a one-time soft background fade (2s) on load; header pill counts them. Clicking toggles "only new".
5. **Micro-detail pass:** `text-wrap: balance` on titles, subtle inset outline on the client photo, 40px hit areas, `prefers-reduced-motion` respected, hairline borders instead of heavy shadows, and keyboard `j/k` + Esc in the drawer. Plus a proper empty/loading/error state on every panel.

## 10. Anti-patterns to avoid

- Tabs-as-navigation for the first screen (Clio's problem). Put the judgment on screen one.
- Counts and lists with no meaning (CasePeer): "12 documents" tells the attorney nothing; show "what matters".
- Uncited AI text. Any claim or date without a chip is a trust failure with attorney judges.
- Vanity KPIs and decorative charts; every tile needs a unit, an "as of," and a source.
- Pie/donut charts, gauges, 3D, gradient fills, glassmorphism, purple/blue AI gradients.
- Color as the only status signal (add icon + words; colorblind safe).
- Cards inside cards, oversized hero headers, marketing copy on the product screen.
- Modal-on-modal and page jumps for detail; use the single drawer.
- Showing the provider anything internal (worth, spend, strategy notes). Build the share view from an explicit allow-list of fields.
- Dumping all 300 timeline entries unranked or unvirtualized.
- `transition: all`, scroll-triggered animations, spinners with no skeleton.
- Spending demo time on dark mode or mobile: do desktop light only; make provider view mobile-friendly since providers may open it on a phone.

## 11. Suggested build order (design-driven)

1. Tokens + fonts + shell + header (30 min). 2. `<SourceChip>`, `<SourcedDate>`, Evidence drawer on fixtures (45 min); this unlocks everything. 3. Brief block + KPI row. 4. 10-list + Action Board. 5. Timeline strip. 6. Provider view. 7. Polish items 1-5. Demo script should open a matter cold, read the brief in 90s, then click a date to show the source.
