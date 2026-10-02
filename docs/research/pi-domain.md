# Personal Injury (PI) Domain Primer for the Dashboard

Audience: solo dev, no legal background. Judges include trial attorneys, so terminology must be right. Case: "Sapini" (car-crash type, litigated, in Clio Manage).
Confidence: stage model, glossary, coverage and lien mechanics are standard practice (high confidence). Multiplier and per-diem numbers are rules of thumb from PI firm blogs and insurer-side explainers, not law. State-specific rules vary: always label them "varies by state" and never state a deadline as a fact for Sapini without the case's venue.

Sources consulted: [CasePeer PI case management guide](https://www.casepeer.com/blog/personal-injury-case-management-guide-and-checklist/), [Injury Claim Source stages](https://www.injuryclaimsource.com/personal-injury-case-stages/), [Nolo: how insurers value injury claims](https://www.nolo.com/legal-encyclopedia/how-do-insurers-value-injury-29976.html), [EvenUp valuation guide](https://www.evenuplaw.com/guides/calculate-personal-injury-settlement-value/), [Victims Lawyer: adjuster spreadsheet](https://www.victimslawyer.com/blog/how-insurance-companies-actually-calculate-personal-injury-settlements-in-california-inside-the-adjusters-spreadsheet/), [NY CPLR 214](https://uk.practicallaw.thomsonreuters.com/Document/NA84A7CD067DD11ECAE78A32A341D5C78/View/FullText.html), [Miller & Zois on Medicare liens](https://www.millerandzois.com/blog/medicare-liens-dont-go-away/).

---

## 1. Case lifecycle: proposed stage model

About 95% of PI claims settle before trial; only roughly 3-5% reach a verdict. Stages are not strictly linear (treatment continues during litigation).

| # | Stage (display label) | What is happening | Signals in Clio notes / tasks / dates / docs |
|---|---|---|---|
| 1 | **Intake / Investigation** | Sign retainer, send letters of representation, collect police report, photos, insurance info, preserve evidence, identify liability | "retainer signed", "LOR sent", "police report/MV-104/crash report ordered", "photos", "recorded statement", "spoliation letter", "declarations page requested" |
| 2 | **Treatment** (active) | Client treats; firm refers to providers, tracks appointments | appointment reminders, "PT/chiro/ortho/MRI/ESI/surgery consult", provider names, "client no-show/cancelled", "follow-up w/ client" |
| 3 | **Records & Bills Gathering** | Request medical records and itemized bills, wage docs; reach MMI/discharge | "records request", "HIPAA auth", "bills received", "narrative report", "discharged / MMI / treatment complete" |
| 4 | **Demand** | Demand package (liability, injuries, specials, valuation) sent to carrier; often a time-limited policy-limits demand | "demand package sent", "demand letter", "time-limit demand", "30-day response deadline" |
| 5 | **Negotiation** | Offers and counteroffers | "offer", "counter", "adjuster", "$ figure + call", "carrier denies/disputes liability" |
| 6 | **Litigation: Pleadings** | Complaint filed, defendant served, answer | "complaint filed", "index/case/docket no.", "served", "answer", "summons" (NY: "index number", "RJI") |
| 7 | **Litigation: Discovery** | Written discovery, depositions, IMEs, expert disclosure | "interrogatories", "demand for documents", "deposition scheduled/taken", "IME / defense medical exam", "preliminary conference / scheduling order", "note of issue" (NY) |
| 8 | **Mediation / Settlement Conference** | ADR or court-ordered conference | "mediation", "mediator", "settlement conference", "pretrial conference" |
| 9 | **Trial** | Jury selection through verdict | "trial date", "motion in limine", "jury", "verdict" |
| 10 | **Settlement / Resolution** | Agreement reached; release signed; or verdict | "accepted", "settled for $", "release", "settlement agreement", "stipulation of discontinuance" |
| 11 | **Disbursement / Lien Resolution** | Funds received; liens negotiated; closing statement; checks out | "settlement check received", "lien reduction request", "final lien amount", "closing statement", "disbursement", "trust account" |
| 12 | **Closed** | File closed | Clio matter status Closed, closing letter |

Dashboard guidance:
- Show a horizontal stepper with the current stage highlighted and "days in stage".
- Infer stage as the **furthest-along stage with evidence** (a complaint filed means stage 6+ even if notes still say "treating"). Show the evidence note/date that triggered it ("Inferred from: 'Complaint filed' on 2025-03-12") so attorneys can verify. Mark as "AI-inferred".
- Collapse for providers: **Treating -> Pre-suit negotiation -> In litigation -> Settled / paying liens -> Closed**. Providers care less about discovery vs. mediation.
- Stage 6+ means "in suit". Litigated cases take longer; many sources cite roughly 1-3 years from filing to trial depending on venue.
- Do not call a case "alive" if the matter is closed, dismissed, or the SOL has passed without a filing.

---

## 2. Case valuation

### Components of damages
- **Special damages (economic, "specials")**: concrete, documented dollar losses.
  - Past medical expenses (billed amounts; also paid/owed/adjusted amounts, depending on state)
  - Future medical expenses (life-care plan, recommended surgery, injections)
  - Lost wages / lost earning capacity
  - Property damage (vehicle repair or total loss) and out-of-pocket costs. Property damage is usually a separate claim under the at-fault party's PD coverage and is **not** part of the BI settlement value. Show it separately, or not at all.
- **General damages (non-economic)**: pain and suffering, loss of enjoyment of life, disfigurement, emotional distress, loss of consortium (spouse's claim). Hard to quantify. This is where multipliers and per diem come in.
- **Punitive damages**: rare in car cases (DUI, egregious conduct). Often not insurable. Do not include in the base valuation.

### Heuristics (explain as heuristics, not formulas)
- **Multiplier method**: general damages roughly equals medical specials times 1.5 to 5. Rough bands from PI blogs: soft-tissue, no surgery 1.5-2x; herniation, no surgery 2-3x; surgical ortho 2.5-3.5x; catastrophic or permanent injuries higher. Insurers deny using the multiplier method, and software (Colossus-style) is points-based. Lawyers still use it for ballparking.
- **Per diem method**: daily rate (commonly cited $100-$300/day, often tied to the client's daily wage) times days from injury to MMI. It is more favorable on long recoveries.
- **Modifiers that move value**: liability strength and comparative fault, injury severity and permanency, objective findings (MRI, surgery) vs. subjective complaints, treatment consistency (gaps), prior injuries or pre-existing conditions, client credibility, venue, defendant likability, available coverage.
- **Comparative / contributory negligence**: the client's share of fault reduces recovery (pure comparative in NY and CA; modified 50/51% bar in many states; a few states bar recovery at any fault).
- **Serious injury threshold (no-fault states, e.g., NY)**: to sue for pain and suffering, the injury must meet a statutory "serious injury" definition (fracture, permanent loss, significant limitation, 90/180-day impairment). A key valuation driver in NY-type states.

### How firms state "estimated case value"
- Usually a **range** in an internal valuation memo or reserve note: e.g., "$150k-$300k, settlement target $225k", set after MMI.
- Often bounded by **policy limits**: you rarely recover above available coverage unless the defendant has assets or the carrier acts in bad faith after refusing a reasonable within-limits demand.
- Common statements: "Specials $X; policy limits $Y; demand $Z; last offer $W." A **policy-limits demand** or **tender** ("carrier tendered its $100k limit") is a milestone: a tender caps the BI recovery from that carrier but is a strong outcome when damages exceed limits. Then look at UIM and the client's own coverage.
- Net-to-client matters too: gross settlement minus attorney fee (commonly 33.3% pre-suit and 40% in suit; varies, regulated in some states such as NY for PI contingent fees), minus case costs, minus liens, equals net to client.

### What the dashboard "Case Worth" KPI should show
Never one false-precision number. Show:
1. **Range** (low / likely / high) with a labelled method, e.g. "Heuristic: specials x 1.5-3.5, capped by available limits".
2. **Drivers (a "why" breakdown)**: medical specials billed to date, future medical (if documented), lost wages, injury type and permanency flags, liability assessment, treatment gaps, available coverage cap.
3. **Cap line**: "Practical ceiling: $X known BI limits (+ UIM if applicable)". If the range exceeds the cap, flag it.
4. **Confidence / data completeness**: "Based on 14 of ~20 expected bills; no demand yet; no defendant limits confirmed."
5. **Attorney-entered value takes precedence** if the notes contain one (e.g., "evaluation $250k"). Show it with its date and source, and label model estimates separately ("Firm evaluation" vs. "Heuristic estimate").
6. **Latest hard numbers**: demand amount, last offer, any tender. They are facts, not estimates.
7. **Net-to-client waterfall** (optional): gross, minus fees, minus costs, minus liens, equals net.
Disclaimer: "Estimate for planning; not legal advice or a guarantee."

---

## 3. Coverage ("what sits behind the case")

| Coverage | Whose policy | What it pays | Notes for dashboard |
|---|---|---|---|
| **BI (Bodily Injury) liability** | At-fault driver | Injuries to others, up to per-person / per-accident limits (e.g., 25/50, 100/300 = $100k per person / $300k per accident) | Primary source of recovery. Capture limits, carrier, claim number, adjuster, policy-limits confirmed or not. Minimum limits vary by state. |
| **PD liability** | At-fault driver | Vehicle damage | Separate from BI. |
| **UM (Uninsured Motorist)** | Client's own policy (or household / occupied vehicle) | Injury losses when at-fault driver has no insurance (or hit-and-run) | Often an alternative pool. |
| **UIM / SUM (Underinsured; NY term "SUM")** | Client's own policy | Gap when at-fault limits are lower than damages | Typically requires exhausting or settling the at-fault limits with the UIM carrier's consent. Check each state's rules. Flag "UIM possible". |
| **MedPay / PIP / No-Fault** | Client's own auto policy | Medical bills (and in PIP / no-fault states, lost wages) regardless of fault, up to a set amount (MedPay often $1k-$10k+; NY no-fault $50k basic) | Pays providers first in many cases, then may have reimbursement rights. For providers: **a no-fault / MedPay payer may be billable now, before the case resolves**. |
| **Health insurance** | Client's plan | Pays treatment at contracted rates | Plan may assert **subrogation / reimbursement** from the settlement (ERISA self-funded plans are powerful). Providers contracted with the plan may be barred from balance billing or holding liens in some states. |
| **Umbrella / excess** | Defendant (or defendant's employer) | Excess liability above the primary BI limits | Ask in discovery; often disclosed only in litigation. Key upside for large injuries. |
| **Commercial / employer coverage** | If the defendant was working (vehicle owned by a business) | Respondeat superior, higher limits | Check notes for "commercial", "company vehicle", "DOT". |
| **Med-Pay for passengers / other vehicle policies** | Varies | | Check the "household policies" and "occupied vehicle" rules. |

**What "coverage behind the case" means to a lien provider**: Is there a collectible source of money that will pay the lien at resolution? Answer in layers:
1. Liability accepted or disputed? (No liability, no recovery.)
2. Known BI limits and whether the carrier confirmed or tendered.
3. Other layers: UM / UIM, MedPay / PIP, umbrella.
4. Competing claimants: other injured people sharing a per-accident limit (limits can be exhausted), other liens ahead of the provider (Medicare, Medicaid, health plan, attorney costs and fees).
5. Is the firm still counsel of record and actively handling? (A provider's LOP (letter of protection) is only as good as the case.)
Dashboard: a "Coverage" card with a status chip (Confirmed / Pending / Unknown / Disputed), limit amount, source, date confirmed. Give providers a "Coverage layers" stack and a plain-English verdict: "Coverage confirmed: $100k BI limit (State Farm), UIM possible."

---

## 4. Liens and how providers get paid

- **Letter of Protection (LOP) / medical lien**: provider treats the client without upfront payment, in exchange for the client and attorney agreeing the provider is paid from the settlement. Common in chiropractic, PT, imaging, ortho, pain management, and surgery centers. It is contractual (LOP) or, in some states, statutory (hospital lien acts).
- **Attorney's acknowledgment**: the firm signs the LOP and holds funds in trust for the lien. The provider is paid at **disbursement**, from the firm's trust account, after settlement.
- **Payment order at disbursement**: statutory / government liens first (Medicare, Medicaid), then ERISA / health plan reimbursement, then other providers, with the attorney fee and costs per the fee agreement. A closing statement itemizes everything.
- **Lien reduction**: typical practice is that the firm asks providers to reduce balances ("pro-rata", often 20-50%+) because the settlement cannot cover everything at full bill value. Providers who treat on LOP expect negotiation. Reductions are justified by: limited limits, procurement costs (fee and costs), "made whole" arguments.
- **Billed vs. paid**: LOP bills are often at full "chargemaster" rates; defense argues reasonable value (the paid amount). Some states allow evidence of what insurance paid; others (collateral source rule) bar it. This matters for the "specials" number.
- **Statutory liens**:
  - **Medicare**: federal conditional payment recovery under the Medicare Secondary Payer Act. Must be resolved from the settlement; set-aside issues for future medicals. Procurement cost reduction applies (fees and costs).
  - **Medicaid**: state lien right, state-specific reductions.
  - **ERISA self-funded health plans**: reimbursement per plan terms; can pre-empt state anti-subrogation rules.
  - **Hospital liens**: statutory in many states, attaching to the settlement. Workers' comp liens also exist (if injury was work-related).
  - **Child support liens**, **Medicare Advantage**, **VA / Tricare** (federal recovery claims) are also possible.
- **Provider status vocabulary to display**: Billed, Paid by insurance/MedPay, Adjusted, **Outstanding on lien (LOP balance)**, Reduction requested, Reduction agreed, Paid at disbursement.

---

## 5. Key deadlines

Never present a deadline without the **state and basis**. Make the SOL date a computed field: incident date + state period, flagged as "verify with attorney".

- **Statute of limitations (SOL)**: the deadline to file suit. Missing it generally kills the claim. Varies by state, typically **1-6 years for PI**; commonly **2-3 years**. Example, New York: **3 years** from the accident (CPLR 214(5)) for negligence PI. Other examples: California 2 years, Texas 2 years, Florida 2 years for negligence (changed in 2023), Illinois 2 years, Tennessee 1 year. (Verify; these are illustrations.)
- **Tolling**: SOL may be extended for minors, incapacity, defendant out of state, etc. Do not auto-calculate for minors.
- **Claims against government entities**: short **notice of claim** deadlines, often 30-180 days (NY: 90 days to file a notice of claim against a municipality, and suit generally within 1 year 90 days). Flag if the defendant is a city, state, county, or public transit. Missing these is a classic malpractice trap.
- **No-fault / PIP claim deadlines**: NY no-fault application generally within **30 days** of the accident; providers must submit bills within 45 days of service. Other states have PIP notice windows.
- **Insurance policy notice**: prompt notice to carrier; UM / UIM claims may have their own contractual notice and consent-to-settle rules.
- **Litigation deadlines (court-driven)**: service of process (e.g., 120 days in NY after filing, 90 days in federal), answer due (typically 20-30 days after service), discovery cut-off, expert disclosure, dispositive motions, mediation date, trial date; "note of issue" (NY) sets the trial-ready stage.
- **Time-limit demand**: carrier typically given 30 days to respond to a policy-limits demand. A key date.
- **Lien and funding deadlines**: Medicare conditional payment response windows, settlement payment deadlines after release (many states 20-30 days).
Dashboard: a "Deadlines" list sorted by date with days-remaining chips (red < 30 days). SOL has its own prominent card: "SOL: 2027-xx-xx (3 yrs, NY CPLR 214) - 412 days left. Suit filed: Yes -> deadline satisfied."

---

## 6. Treatment gaps (and the "is my patient showing up?" question)

- A **treatment gap** is a period with no treatment between visits (rules of thumb: 2+ weeks starts to raise questions, 30+ days is a serious gap, and a gap between the accident and first treatment is also scrutinized; "treated within 24-72 hours" is the benchmark).
- Why it hurts: defense and adjusters argue the injury resolved, was not serious, or has another cause (a "break in the causal chain"), and cut the pain-and-suffering multiplier. Gaps are called the "single largest" lever for reducing the multiplier. Jurors discount too. Related: **failure to mitigate damages**, noncompliance with prescribed care, missed appointments, and abruptly stopping treatment before discharge.
- Mitigation: documented reasons (financial hardship, transport, childcare, work, doctor-ordered rest, insurance denial, COVID, specialist wait lists); a provider note explaining the gap; continuity in care.
- Not all gaps are equal: a planned break with a physician's written plan differs from silent drop-off. Surgery recovery periods are not gaps.
- Dashboard metrics for "Is the patient showing up?":
  - Last visit date; days since last visit
  - Visits last 30/90 days vs. the plan (e.g., "3x/week x 8 weeks")
  - Missed / cancelled / no-show counts and attendance rate
  - **Longest gap (days)** and current gap, with a threshold flag (> 14 days = watch, > 30 days = at risk)
  - Timeline strip: one tick per visit, with gaps shaded
  - Provider-by-provider view (a provider sees their own patient attendance; the attorney sees all)
- Be neutral in tone for providers: "No visit in 41 days" rather than accusatory language. Also this info feeds the "Case Worth" drivers: gap = downward pressure.

---

## 7. Glossary (use exactly these terms in the UI)

1. **Plaintiff** - the injured party who sues (our client).
2. **Defendant** - the party alleged at fault (driver/owner/entity) being sued.
3. **Claimant** - person making a claim against an insurer (pre-suit).
4. **Tortfeasor** - the at-fault party; the person who committed the wrong.
5. **Negligence** - failure to use reasonable care that causes injury; the basis for most auto cases.
6. **Liability** - legal responsibility for the injury; "liability disputed" means fault is contested.
7. **Comparative negligence** - reduces recovery by the plaintiff's own percentage of fault.
8. **Damages** - money awarded for loss: specials (economic) and generals (non-economic).
9. **Special damages (specials)** - quantifiable economic losses: medical bills, lost wages.
10. **General damages** - non-economic: pain and suffering, loss of enjoyment.
11. **MMI (Maximum Medical Improvement)** - point where treatment is no longer expected to improve the condition; demand is usually sent after it.
12. **Medical specials / meds** - total medical expenses (billed).
13. **Policy limits** - maximum an insurance policy will pay; e.g., 100/300.
14. **Declarations page ("dec page")** - policy summary page showing limits; request it from the carrier.
15. **BI (Bodily Injury) coverage** - liability coverage paying injuries to others.
16. **UM / UIM (SUM in NY)** - client's own coverage for uninsured / underinsured at-fault drivers.
17. **MedPay / PIP / No-fault** - first-party medical (and wage) coverage regardless of fault.
18. **Subrogation** - an insurer's right to be repaid from the client's recovery after it paid benefits.
19. **Lien** - a legal claim on settlement proceeds for amounts owed (provider, health plan, Medicare).
20. **Letter of Protection (LOP)** - agreement that a provider treats now and is paid from the settlement.
21. **Medicare conditional payments** - what Medicare paid for accident-related care; must be repaid from the settlement.
22. **Demand letter / demand package** - formal settlement demand with facts, medicals, and an amount.
23. **Policy-limits demand / tender** - demand for the full limit; tender is the carrier offering/paying the full limit.
24. **Adjuster** - insurance company's claim representative who evaluates and negotiates.
25. **Complaint** - pleading that starts a lawsuit (NY: summons and complaint).
26. **Discovery** - formal exchange of information: interrogatories, document requests, depositions.
27. **Deposition** - sworn out-of-court testimony of a party or witness.
28. **IME (Independent Medical Exam)** - defense-requested exam of the plaintiff by the insurer's doctor (a.k.a. defense medical exam).
29. **Mediation** - settlement negotiation led by a neutral third party.
30. **Statute of limitations (SOL)** - deadline to file suit.
31. **Notice of claim** - required pre-suit notice when suing a government entity.
32. **Release** - document the client signs giving up further claims in exchange for settlement money.
33. **Contingency fee** - attorney is paid a percentage of recovery (no recovery, no fee).
34. **Costs / case expenses** - out-of-pocket case costs advanced by the firm (separate from the fee).
35. **Disbursement / closing statement** - distribution of settlement funds and the itemized breakdown.
36. **IOLTA / trust account** - firm client-funds account where settlement money is held until disbursement.
37. **Reduction (lien reduction)** - negotiated discount of a lien at resolution.
38. **Treatment gap** - unexplained period without care, used to lower value.
39. **Serious injury threshold** - NY no-fault requirement to sue for non-economic loss.
40. **Verdict** - the jury's decision after trial.
Note: "settlement" (agreement) vs. "verdict" (jury decision) vs. "judgment" (court order) are different. "Client" for the firm; "patient" for providers; "plaintiff" in litigation documents. Avoid "lawsuit has been won" language; use "resolved".

---

## 8. Case-cost / expense categories firms track

Costs are advanced by the firm, reimbursed from the settlement (per the fee agreement, usually after the fee is calculated; deduction order matters and is stated in the retainer). The "how much has the firm spent" KPI = sum of unreimbursed costs advanced.

- **Medical records and bills retrieval** (provider fees, record-retrieval vendors; typically a big count line item)
- **Filing fees** (complaint, index number, RJI, motion fees)
- **Service of process** (process server, sheriff fees)
- **Court reporter / transcripts** (depositions, hearings)
- **Expert witness fees** (medical experts, accident reconstructionists, economists, life-care planners, vocational)
- **Medical narrative / report fees** (treating doctor reports, trial testimony fees; often large)
- **Investigation** (investigator, scene photos, surveillance, skip tracing)
- **Police report / accident report fees**
- **Mediation fees / arbitrator fees**
- **Deposition costs** (videographer, interpreter, travel)
- **Trial costs** (exhibits, demonstratives, jury consultant, trial tech, travel)
- **Copying, postage, courier, e-discovery**
- **Medical lien financing / litigation funding costs** (if used)
- **Client advances** (living-expense or medical-funding advances; regulated and sometimes prohibited by state rules)
- **Interpreter / translation, travel, parking, mileage**

Dashboard: total costs advanced, by category (bar), by month (spend over time), top 5 largest items, and costs vs. phase (spend typically spikes at filing, experts, and trial). In Clio these are typically "expense" entries (activity type "Expense"); billable time is often not tracked in contingency PI. Distinguish **costs (hard)** from **time (soft, typically unbilled)**. Include a "% of estimated value" ratio, cautiously.

---

## What the dashboard must get right (cheat sheet)

1. Say "stage" with evidence and a date; do not guess silently; show provenance.
2. Case worth is a **range with drivers and a cap**, not a number; label heuristic vs. attorney valuation.
3. Distinguish **BI limits**, UM/UIM, MedPay/PIP, health-plan subrogation, umbrella. Use "policy limits", "tender", "dec page".
4. Providers' lens: liens paid at disbursement from settlement, after statutory liens, usually negotiated down; use "LOP", "reduction", "outstanding balance".
5. SOL is state-specific: always show state, basis, and "suit filed?" status; flag government-defendant notice-of-claim.
6. Treatment gaps: last visit, longest gap, no-shows, attendance vs. plan; tone neutral for providers.
7. Costs: unreimbursed costs advanced by category, never mixed with attorney fees.
8. Use legal vocabulary correctly: plaintiff/defendant, settlement vs. verdict vs. judgment, specials vs. generals, billed vs. paid.
9. Add "not legal advice / estimate" and keep client-confidential data (PHI, privileged notes) off provider views: providers should not see strategy notes, valuation memos, or other providers' balances.
