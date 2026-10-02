// Haiku fact extraction: coverage limits, case value, liens, specials — each with a verbatim quote.
// Cached per (record, contentHash, extractorVersion). Code does all math and precedence.
import type {
  AiCall, ClioRecord, CoverageLayer, CustomFieldValue, ExtractedFacts, ExtractionCache, LlmRef, Matter, SourceRef,
} from "@/lib/types";
import { validateRefs } from "@/lib/digest";
import { callJson, models, LLM_REF_SCHEMA } from "./client";
import { byDateDesc, normName, quoteContainsNumber, recordBlock } from "./common";

export const FACTS_EXTRACTOR_VERSION = "facts-v3";

// Which free-text records are worth a look. Generic PI vocabulary, not case data.
const FACT_KEYWORDS =
  /\b(limits?|coverage|polic(?:y|ies)|carrier|insur\w*|um\/?uim|uninsured|underinsured|\bpip\b|no-?fault|med-?pay|umbrella|lien\w*|specials|valu(?:e|ation|ed)|settle\w*|demand|offer|tender)\b/i;

const COVERAGE_KINDS: CoverageLayer["kind"][] = ["BI", "UM/UIM", "No-fault/PIP", "MedPay", "Umbrella", "Health/Lien", "Other"];

export interface RawFact {
  kind: "case_value" | "coverage" | "coverage_confirmed" | "lien" | "specials";
  amount: number | null; perPerson: number | null; perAccident: number | null;
  coverageKind: CoverageLayer["kind"] | null; carrier: string | null; holder: string | null;
  confirmed: boolean | null;
  /** coverage only: the layer is used up (benefits exhausted). */
  exhausted?: boolean | null;
  /** coverage only: the party is self-insured (no carrier / no stated policy limit). */
  selfInsured?: boolean | null;
  date: string | null; ref: LlmRef;
}

// Structured outputs reject `enum` under a nullable type array; nullable enums go through anyOf.
const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: "null" }] });

export const FACTS_SCHEMA = {
  type: "object", additionalProperties: false, required: ["facts"],
  properties: {
    facts: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["kind", "amount", "perPerson", "perAccident", "coverageKind", "carrier", "holder", "confirmed",
          "exhausted", "selfInsured", "date", "ref"],
        properties: {
          kind: { type: "string", enum: ["case_value", "coverage", "coverage_confirmed", "lien", "specials"] },
          amount: { type: ["number", "null"] },
          perPerson: { type: ["number", "null"] },
          perAccident: { type: ["number", "null"] },
          coverageKind: nullable({ type: "string", enum: COVERAGE_KINDS }),
          carrier: { type: ["string", "null"] },
          holder: { type: ["string", "null"] },
          confirmed: { type: ["boolean", "null"] },
          exhausted: { type: ["boolean", "null"] },
          selfInsured: { type: ["boolean", "null"] },
          date: { type: ["string", "null"] },
          ref: LLM_REF_SCHEMA,
        },
      },
    },
  },
};

const SYSTEM = `You extract insurance and money facts from a personal-injury case file for a law firm.
Each input record starts with "[id]". For every fact you find, emit one item:
- kind: case_value (attorney's estimate of what the case is worth), coverage (a policy limit layer: BI = the at-fault party's liability coverage, UM/UIM = the client's own uninsured/underinsured motorist coverage, No-fault/PIP, MedPay, Umbrella, Health/Lien, Other), coverage_confirmed (whether limits were confirmed in writing), lien (a lien holder and amount), specials (total medical specials to date).
- Numbers are plain numbers in USD (12500, not "$12.5k"). perPerson/perAccident for split limits; amount for everything else.
- coverage.exhausted = true when the text says that layer's benefits are exhausted/used up (emit it even if no number is stated); otherwise null.
- coverage.selfInsured = true when the text says the party is self-insured / has no carrier (emit it even if no number is stated); otherwise null.
- Emit one coverage item per layer per record, including when a record restates limits already seen elsewhere.
- coverage_confirmed: emit confirmed=true when the record says the limits were confirmed in writing (e.g. by the adjuster or carrier); confirmed=false when it says the limits are unconfirmed or unknown. The quote must contain the confirming words.
- ref.id is the exact "[id]" the fact comes from. ref.quote is a VERBATIM substring of that record's text that contains the number (and the carrier/holder when stated). Never paraphrase inside quote.
- date: the business date of the record if visible, else null.
Do not compute, sum or infer numbers. Skip anything not supported by a verbatim quote. Omit facts you are unsure about.`;

export interface FactsResult { facts: ExtractedFacts; droppedRefs: number; warnings: string[]; candidates: number }

export function selectFactRecords(matter: Matter, records: ClioRecord[]): ClioRecord[] {
  const seen = new Set<string>();
  const out: ClioRecord[] = [];
  const push = (r: ClioRecord) => { if (!seen.has(r.drawerKey)) { seen.add(r.drawerKey); out.push(r); } };
  for (const cf of matter.customFields ?? []) push(cf);
  for (const r of records) {
    if (r.sourceType === "custom_field") push(r);
    else if ((r.sourceType === "note" || r.sourceType === "communication") && FACT_KEYWORDS.test(`${r.title}\n${r.bodyText}`)) push(r);
  }
  return out;
}

function cacheKey(r: ClioRecord) {
  return { sourceType: r.sourceType, clioId: r.clioId, contentHash: r.contentHash, extractorVersion: FACTS_EXTRACTOR_VERSION };
}

function isRawFactArray(v: unknown): v is RawFact[] { return Array.isArray(v); }

/** Models sometimes echo the "[id]" brackets or pad with spaces. */
export function normalizeId(id: string): string { return id.trim().replace(/^\[\s*|\s*\]$/g, ""); }

function customFieldText(cf: CustomFieldValue): string {
  return `[${cf.drawerKey}] custom field "${cf.name}": ${cf.display || String(cf.value ?? "")}`;
}

export async function extractFactsDetailed(i: {
  matter: Matter; records: ClioRecord[]; cache: ExtractionCache; log: (c: AiCall) => void;
}): Promise<FactsResult> {
  const warnings: string[] = [];
  const candidates = selectFactRecords(i.matter, i.records);
  const raw: RawFact[] = [];
  const uncached: ClioRecord[] = [];
  for (const r of candidates) {
    const hit = i.cache.get(cacheKey(r));
    if (isRawFactArray(hit)) raw.push(...hit); else uncached.push(r);
  }

  // Batch uncached records (cheap Haiku calls), then split results back per record for the cache.
  // Small batches keep Haiku's recall high on long files (cheap: ~2-3k tokens each).
  const BATCH_CHARS = 12_000;
  const batches: ClioRecord[][] = [];
  let cur: ClioRecord[] = []; let curLen = 0;
  for (const r of uncached) {
    const len = r.bodyText.length + 100;
    if (cur.length > 0 && curLen + len > BATCH_CHARS) { batches.push(cur); cur = []; curLen = 0; }
    cur.push(r); curLen += len;
  }
  if (cur.length) batches.push(cur);

  for (const batch of batches) {
    const user = batch.map((r) => (r.sourceType === "custom_field" ? customFieldText(r) : recordBlock(r, 4000))).join("\n\n");
    const res = await callJson<{ facts: RawFact[] }>({
      stage: "extract_facts", model: models().extract, system: SYSTEM, user, schema: FACTS_SCHEMA,
      matterId: i.matter.matterId, log: i.log, maxTokens: 4000,
    });
    if (!res.data) { if (res.warning) warnings.push(res.warning); continue; }
    const byId = new Map<string, RawFact[]>();
    for (const r of batch) byId.set(r.drawerKey, []);
    let unknown = 0;
    for (const f of res.data.facts ?? []) {
      if (!f?.ref || typeof f.ref.id !== "string") { unknown++; continue; }
      const fixed: RawFact = { ...f, ref: { ...f.ref, id: normalizeId(f.ref.id) } };
      const list = byId.get(fixed.ref.id);
      if (list) { list.push(fixed); raw.push(fixed); } else unknown++;
    }
    if (unknown) warnings.push(`extract_facts: ${unknown} fact(s) cited an id outside the batch and were skipped`);
    // Only cache a batch whose output mapped cleanly, so a bad response is retried next build.
    if (!unknown) for (const r of batch) i.cache.set(cacheKey(r), byId.get(r.drawerKey) ?? []);
  }

  const merged = mergeFacts(raw, i.records);
  return { facts: merged.facts, droppedRefs: merged.droppedRefs, warnings, candidates: candidates.length };
}

export async function extractFacts(i: {
  matter: Matter; records: ClioRecord[]; cache: ExtractionCache; log: (c: AiCall) => void;
}): Promise<ExtractedFacts> {
  return (await extractFactsDetailed(i)).facts;
}

interface Hydrated { fact: RawFact; ref: SourceRef }

function withoutUnquotedNumbers(f: RawFact): RawFact {
  const keep = (n: number | null) => (n !== null && quoteContainsNumber(f.ref.quote, n) ? n : null);
  return { ...f, amount: keep(f.amount), perPerson: keep(f.perPerson), perAccident: keep(f.perAccident) };
}

/** Validate refs + numeric-quote rule, then apply precedence; pure, unit-tested. */
export function mergeFacts(raw: RawFact[], records: ClioRecord[]): { facts: ExtractedFacts; droppedRefs: number } {
  let droppedRefs = 0;
  const ok: Hydrated[] = [];
  for (const rawFact of raw) {
    if (!rawFact || !rawFact.ref || typeof rawFact.ref.id !== "string") { droppedRefs++; continue; }
    const qualitative = rawFact.kind === "coverage_confirmed"
      || (rawFact.kind === "coverage" && (rawFact.exhausted === true || rawFact.selfInsured === true));
    // A qualitative statement ("self-insured", "exhausted") stands on its words; numbers its quote lacks are discarded.
    const f = qualitative ? withoutUnquotedNumbers(rawFact) : rawFact;
    const numbers = [f.amount, f.perPerson, f.perAccident].filter((n): n is number => typeof n === "number");
    if (!qualitative && numbers.length === 0) { droppedRefs++; continue; }
    if (!numbers.every((n) => quoteContainsNumber(f.ref.quote, n))) { droppedRefs++; continue; }
    const v = validateRefs([{ id: f.ref.id, quote: f.ref.quote ?? null }], records, []);
    if (v.refs.length === 0) { droppedRefs += Math.max(1, v.dropped); continue; }
    const ref = { ...v.refs[0], value: displayValue(f) };
    ok.push({ fact: f, ref });
  }

  const sortLatest = (a: Hydrated, b: Hydrated) => byDateDesc(
    { sourceDate: a.ref.sourceDate ?? a.fact.date }, { sourceDate: b.ref.sourceDate ?? b.fact.date });
  const conflicts: ExtractedFacts["conflicts"] = [];

  // case value: attorney custom field > latest quoted note.
  const cv = ok.filter((h) => h.fact.kind === "case_value" && h.fact.amount !== null)
    .sort((a, b) => Number(b.ref.sourceType === "custom_field") - Number(a.ref.sourceType === "custom_field") || sortLatest(a, b));
  let caseValue: ExtractedFacts["caseValue"] = null;
  if (cv.length) {
    caseValue = { amount: cv[0].fact.amount as number, ref: cv[0].ref };
    const others = cv.slice(1).filter((h) => h.fact.amount !== cv[0].fact.amount);
    if (others.length) conflicts.push({ field: "case_value", refs: [cv[0].ref, ...others.map((h) => h.ref)] });
  }

  // coverage: per kind, latest-dated wins; differing older numbers become conflicts.
  const coverage: CoverageLayer[] = [];
  const groups = new Map<CoverageLayer["kind"], Hydrated[]>();
  for (const h of ok.filter((h) => h.fact.kind === "coverage")) {
    const kind = h.fact.coverageKind ?? "Other";
    groups.set(kind, [...(groups.get(kind) ?? []), h]);
  }
  for (const [kind, all] of groups) {
    all.sort(sortLatest);
    // Exhaustion is one-way: any source saying so marks the layer exhausted.
    const exhaustedBy = all.filter((h) => h.fact.exhausted === true);
    const numeric = all.filter((h) => (h.fact.perPerson ?? h.fact.amount) !== null);
    const w = numeric[0] ?? all[0];
    const perPerson = w.fact.perPerson ?? w.fact.amount;
    const perAccident = w.fact.perAccident;
    const carrier = all.map((h) => h.fact.carrier).find((c) => !!c) ?? null;
    const refs = [w.ref, ...exhaustedBy.filter((h) => h !== w).slice(0, 1).map((h) => h.ref)];
    coverage.push({ kind, perPerson, perAccident, carrier, ...(exhaustedBy.length ? { exhausted: true } : {}), refs });
    // Older sources disagree when they state different limits, or self-insurance against a stated limit.
    // A source that omits the per-accident figure does not contradict one that states it.
    const differing = numeric.slice(1).filter((h) => (h.fact.perPerson ?? h.fact.amount) !== perPerson
      || (h.fact.perAccident !== null && perAccident !== null && h.fact.perAccident !== perAccident));
    const selfInsured = perPerson !== null
      ? all.filter((h) => h.fact.selfInsured === true && (h.fact.perPerson ?? h.fact.amount) === null) : [];
    const against = [...differing, ...selfInsured].sort(sortLatest);
    if (against.length) conflicts.push({ field: "coverage", refs: [w.ref, ...against.map((h) => h.ref)] });
  }

  // Models often flag confirmation on the coverage item itself; both forms count.
  const cc = ok.filter((h) => (h.fact.kind === "coverage_confirmed" || (h.fact.kind === "coverage" && h.fact.coverageKind === "BI"))
    && typeof h.fact.confirmed === "boolean").sort(sortLatest);
  const coverageConfirmed: ExtractedFacts["coverageConfirmed"] = cc.length
    ? { confirmed: cc[0].fact.confirmed as boolean, on: cc[0].ref.sourceDate ?? cc[0].fact.date, ref: cc[0].ref } : null;

  // liens: one per holder, latest wins.
  const liens: ExtractedFacts["liens"] = [];
  const byHolder = new Map<string, Hydrated[]>();
  for (const h of ok.filter((h) => h.fact.kind === "lien")) {
    const key = holderKey(h.fact.holder, [...byHolder.keys()]);
    byHolder.set(key, [...(byHolder.get(key) ?? []), h]);
  }
  for (const list of byHolder.values()) {
    list.sort(sortLatest);
    const w = list[0];
    liens.push({ holder: w.fact.holder ?? "Unknown lien holder", amount: w.fact.amount, ref: w.ref });
    const differing = list.slice(1).filter((h) => h.fact.amount !== w.fact.amount);
    if (differing.length) conflicts.push({ field: "liens", refs: [w.ref, ...differing.map((h) => h.ref)] });
  }

  const sp = ok.filter((h) => h.fact.kind === "specials").sort(sortLatest);
  if (sp.length > 1) {
    const differing = sp.slice(1).filter((h) => h.fact.amount !== sp[0].fact.amount);
    if (differing.length) conflicts.push({ field: "specials", refs: [sp[0].ref, ...differing.map((h) => h.ref)] });
  }

  return { facts: { caseValue, coverage, coverageConfirmed, liens, conflicts }, droppedRefs };
}

const HOLDER_STOP = new Set(["the", "of", "state", "new", "york", "dept", "department", "inc", "llc", "program", "plan"]);
const holderTokens = (s: string) => normName(s).split(" ").filter((t) => t && !HOLDER_STOP.has(t));
/** Same lien holder written two ways ("Medicaid" vs "State Medicaid program") maps to one key. */
export function holderKey(holder: string | null, existing: string[]): string {
  const key = normName(holder ?? "unknown") || "unknown";
  const mine = holderTokens(key);
  const match = existing.find((k) => {
    const theirs = holderTokens(k);
    if (!mine.length || !theirs.length) return k === key;
    const [small, big] = mine.length <= theirs.length ? [mine, theirs] : [theirs, mine];
    return small.every((t) => big.includes(t));
  });
  return match ?? key;
}

function displayValue(f: RawFact): string {
  const usd = (n: number) => `$${n.toLocaleString("en-US")}`;
  if (f.kind === "coverage") {
    const a = f.perPerson ?? f.amount; const b = f.perAccident;
    if (a !== null) return b !== null ? `${usd(a)}/${usd(b)}` : usd(a);
    return f.exhausted ? "exhausted" : f.selfInsured ? "self-insured" : "";
  }
  if (f.kind === "coverage_confirmed") return f.confirmed ? "confirmed" : "not confirmed";
  return f.amount !== null ? usd(f.amount) : "";
}
