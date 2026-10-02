# Competitive Landscape and Judge Lens

Researched 2026-10-02 from public web sources (vendor pages, press releases, review sites). Baseline: marketing claims, not hands-on testing. "Not found" means not found in public material today, not proven absent. Verify any claim before putting it in the pitch video.

## 1. Feature matrix

Legend: Y = publicly claimed. P = partial or adjacent. - = not found in public material.

| Product | Case summary | Timeline / chronology | Source citations | Doc / med-record extraction | Provider portal / sharing | Change tracking |
|---|---|---|---|---|---|---|
| Supio | Y (AI chat + insights) | Y (Instant Timeline, cross-linked events/providers/injuries) | Y (facts pinned to source; claims ~97% citation precision) | Y (records, bills, voice, email, video) | - (firm-facing) | P (Case Signals monitors chronology for connections) |
| EvenUp | Y (MedChron summaries) | Y (interactive MedChrons) | Y (traceable to record) | Y (records, Medical Bill Summary) | - (firm-facing; demand-letter focus) | - |
| Clio Manage AI (ex-Duo) | Y ("Catch up" widget, auto-refreshing matter summary) | P (no medical timeline) | P (summary of matter activity, not record-level provenance) | P (doc analysis, date extraction, intake autofill) | - (Clio client portal is client-facing, not provider) | P (summary refreshes with a freshness indicator; activity-based, not field-level diff) |
| Filevine (MedChron, DemandsAI, LOIS) | Y | Y (gaps in care, red flags) | Y (hyperlinked to source, Bates) | Y (typed, handwritten, scanned) | - | P (LOIS agent writes back to matter, tasks, deadlines) |
| Litify AI (Damages Assistant) | Y (Strengths and Weaknesses agent) | Y (chronology + reconciled bill ledger) | Y ("source-linked") | Y (records and bills on upload) | - | - |
| CasePeer | P (CasePeer IQ summarization announced/rolling out) | P (treatment tracking) | - | P (via partners such as Practice AI, Foundation AI) | - | - |
| SmartAdvocate (SmartIntelligence, Aug 2026) | Y (multi-doc summaries, AI case chat) | Y (medical chronologies automation) | Not found | Y | - | - |
| Lawmatics | - (intake/CRM focus: QualifyAI, EngageAI, MerlinAI) | - | - | - | - | - |
| Eve | Y (case overviews) | Y (chronologies) | Not found | Y | - | P (nightly "Auditor" sweeps every active matter for missed injuries) |
| Swans | Not a product. Custom AI/automation built per enterprise PI firm ("in-house AI department") | n/a | n/a | n/a | n/a | n/a |
| Gain Servicing (lien/LOP servicing) | P (case status dashboard) | - | - | P (document storage) | Y (provider and attorney portal, LOP/lien tracking, payoff requests, messaging) | P (real-time case progress, attorney activity, settlements) |
| Quilia (liens, MyCase/Clio integration) | P | - | - | - | Y for lien companies (portfolio dashboard); for law firms, client treatment monitoring and client app | P (lien and case status in real time) |
| JusticeBolt (provider-side LOP tracking) | - | - | - | - | Y (electronic LOP and lien tracking, comms with firms) | P |

Takeaways from the matrix:
- Summary + chronology + citations + extraction is now table stakes. Supio, EvenUp, Filevine, Litify all claim source-linked chronologies. Do not pitch "AI summary with citations" as the differentiator.
- Every strong AI product is firm-facing and built on uploaded records. None reads the live practice-management system (Clio) as the source of truth and visualizes it.
- Provider portals exist only in the lien-servicing world (Gain, Quilia, JusticeBolt). They are status/payoff/ledger tools with no AI digestion and no provenance.
- Chat is the default interface for the AI products (Supio chat, Clio ask, SmartAdvocate case chat, Litify Ask and Draft). The brief explicitly says "not a chat box."
- Clio's own "Catch up" widget is the closest thing to our use case (1). It is a text summary, firm-only, with no provider view.

Sources: supio.com (chronologies, 2025 blog), evenuplaw.com guides, help.clio.com "Manage AI: The Evolution of Clio Duo", filevine.com/features/medical-chronologies, litify.com/litify-ai and Business Wire (Oct 2025 Damages Assistant), casepeer.com, GlobeNewswire (SmartIntelligence, Aug 2026), eve.legal/platform, lawmatics.com, gainservicing.com (provider portals), quilia.com/liens, justicebolt.com/medical-funding, swans.co.

## 2. White space

1. **Provider-side visibility that is curated, not raw.** Lien portals show status and money. Nobody gives a treating provider a safe, plain-language, case-state view: what the case is, where it stands, what the firm needs from them (records/bills/narrative), and what is not shown. The curation (what a provider may see vs. privileged material) is the product, and it is a trust problem competitors have not solved visibly.
2. **Provenance on the whole case, not just medical records.** Competitors cite medical records. A Clio matter also holds activities, calendar, tasks, notes, communications, bills, documents. Linking every dashboard tile back to the exact Clio object (or document page) is unclaimed for the live-matter view.
3. **Live-matter state vs. one-time document pipeline.** Existing tools ingest uploads and generate artifacts (chronology, demand). A dashboard bound to the live Clio matter, with "what changed since you last looked," is a different job: orientation for staff, handoffs, and providers asking "where are we?"
4. **Change tracking as a first-class view.** Only Clio's refreshing summary and Eve's nightly auditor come close. A visual "since your last visit" diff (new records, new deadlines, status moves) is not offered, and it is exactly what a provider checking monthly or a new paralegal needs.
5. **Visual digestion rather than text or chat.** Summaries and chat dominate. Few offer a one-screen visual state of a case (treatment arc, gaps, deadlines, lien exposure) that is scannable in seconds.
6. **Two audiences, one source of truth.** No product renders attorney and provider views from the same provenance-backed data with role-based redaction.

## 3. Judge lens (organizations, public info only)

| Judge | Org | What the org likely values |
|---|---|---|
| Erika Contreras | Panish, Shea, Ravipudi LLP (large CA/NV/AZ plaintiff trial firm: catastrophic injury, wrongful death, mass tort) | Accuracy and defensibility. Can I trust a number or date and click through to the source? Speed to get a new team member up to speed on a big file. Wary of hallucination risk. |
| Mark Day | Coastal Research (policy-limits search, asset and background research for PI firms) | Data quality and case-exposure facts (policy limits, defendant finances). Would value a dashboard that has a clear place for exposure and recoverability data, and that treats sources rigorously. |
| Eleonor Harutyunyan | KAASS Law (high-volume multilingual CA PI firm) | Throughput and consistency across many files; staff getting up to speed fast; client and provider communication load. Practicality over novelty. |
| Colleen Joyce | Lawyer.com (lawyer-matching/marketing, growth-focused) | Clear market story and ease of adoption; the "who is this for and why will firms pay" angle; clean demo that a non-technical lawyer instantly grasps. |
| Jared Podnos | Thomson Reuters (CoCounsel, Westlaw; partners with Supio) | Trustworthy AI: grounding, citations, auditability, responsible design. Will notice if provenance is real or cosmetic. Sees Supio as a partner, so knows the space. |
| Andy Roddick | ViewFi (virtual MSK/orthopedic care, treats injured patients) | The treating-provider side: does the share reduce administrative friction for clinicians and keep care moving? Patient-centered framing. (ViewFi is a care platform, not a lien company.) |
| Jerry Zhou | Supio (AI for PI: chronologies, demand, Case Signals) | Deep knowledge of the category. Will instantly spot a generic summary or chronology clone. Respects real differentiation and sound engineering around source linking. |

Recruiting partners (not judges): Kiln and Go Bright Business are talent-oriented. A short mention of clean, shippable engineering helps. No need to tailor the pitch.

Pitch implication: the room is split between "trust and accuracy" buyers (Panish, TR, Supio) and "practicality and adoption" buyers (KAASS, Lawyer.com, Roddick). Demo should show a click-through-to-source moment (trust) and a provider-view moment (new capability) in under 4 minutes.

## 4. Positioning and differentiators

**Positioning (one line):** A live, source-linked view of a Clio case that gets a new team member up to speed in 60 seconds and gives treating providers a safe, curated window into the case, with every number clickable back to where it came from.

Shorter variant: "Every fact on the screen is one click from its source, and the case looks right to both the attorney and the treating doctor."

**Three differentiators to emphasize:**

1. **Provenance on every tile.** Every date, amount, and status links to the exact Clio record or document page. Show a click-through live in the video. This is what separates it from generic summaries and answers Panish, TR, and Supio on trust.
2. **Curated provider share.** One case, two views: the attorney dashboard and a provider view that exposes only what the firm approves (treatment status, outstanding requests, lien balance as the firm chooses), with a visible "not shared" boundary. Nobody in the matrix does this with AI digestion. This is the headline white space.
3. **Live and changing: "what changed since you last looked."** Bound to the live Clio matter, with a visual change feed and gaps/deadline callouts, so orientation takes seconds and providers do not need to call for status.

**Things to avoid:**
- Looking like a chatbot or putting a chat box front and center (brief says no, and every competitor already has one).
- Re-creating Supio/EvenUp/Filevine: a medical chronology plus demand letter is the incumbent playbook. If a timeline appears, make it a supporting view with provenance, not the story.
- Claiming accuracy numbers, "HIPAA compliant," or "production ready." Say "designed for" and show the access boundary instead.
- Unsourced AI prose. If a statement has no link, do not display it as fact. Mark low-confidence items explicitly.
- Exposing privileged or strategy material in the provider view, even by accident in the demo. Use clearly synthetic or consented sandbox data and say so.
- Slide-heavy narration. Four minutes: 30s problem, 2.5m live demo (attorney view, click to source, provider share, change feed), 30s why it wins, 30s close.
- Attacking Clio or Swans. Frame as built on top of Clio, complementary to Swans' approach of custom AI for PI firms.

**Submission-form "differentiator" draft (one sentence):** "The only dashboard that turns a live Clio PI case into a source-linked visual brief for the firm and a curated, permissioned view for lien-treating providers, so everyone sees the same verified facts without a chat box or a phone call."

## 5. Caveats and open items

- All competitor capabilities are from public marketing and third-party review pages; some (CasePeer IQ summarization, SmartAdvocate citations) are unconfirmed or announced rather than shipped.
- The matrix has no hands-on verification. Re-check Supio and Clio "Catch up" before claiming any gap in the video.
- Judge entries describe their organizations only, per scope. ViewFi and Coastal Research public information was thin, so those two lines are inference from what the companies do.
- "Painworks" was in the user's example list for lien tooling but returned no relevant product. Omitted.
