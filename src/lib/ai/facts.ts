// Haiku fact extraction: coverage limits, case value, liens, specials — each with a verbatim quote.
// Cached per (record, contentHash, extractorVersion). Code does all math and precedence.
import type {
  AiCall, ClioRecord, CoverageLayer, CustomFieldValue, ExtractedFacts, ExtractionCache, LlmRef, Matter, SourceRef,
} from "@/lib/types";
import { validateRefs } from "@/lib/digest";
import { callJson, models, LLM_REF_SCHEMA } from "./client";
import { byDateDesc, quoteContainsNumber, recordBlock } from "./common";

export const FACTS_EXTRACTOR_VERSION = "facts-v1";

// Which free-text records are worth a look. Generic PI vocabulary, not case data.
const FACT_KEYWORDS =
  /\b(limits?|coverage|polic(?:y|ies)|carrier|insur\w*|um\/?uim|uninsured|underinsured|\bpip\b|no-?fault|med-?pay|umbrella|lien\w*|specials|valu(?:e|ation|ed)|settle\w*|demand|offer|tender)\b/i;

const COVERAGE_KINDS: CoverageLayer["kind"][] = ["BI", "UM/UIM", "No-fault/PIP", "MedPay", "Umbrella", "Health/Lien", "Other"];

export interface RawFact {
  kind: "case_value" | "coverage" | "coverage_confirmed" | "lien" | "specials";
  amount: number | null; perPerson: number | null; perAccident: number | null;
  coverageKind: CoverageLayer["kind"] | null; carrier: string | null; holder: string | null;
  confirmed: boolean | null; date: string | null; ref: LlmRef;
}

const FACTS_SCHEMA = {
  type: "object", additionalProperties: false, required: ["facts"],
  properties: {
    facts: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["kind", "amount", "perPerson", "perAccident", "coverageKind", "carrier", "holder", "confirmed", "date", "ref"],
        properties: {
          kind: { type: "string", enum: ["case_value", "coverage", "coverage_confirmed", "lien", "specials"] },
          amount: { type: ["number", "null"] },
          perPerson: { type: ["number", "null"] },
          perAccident: { type: ["number", "null"] },
          coverageKind: { type: ["string", "null"], enum: [...COVERAGE_KINDS, null] },
          carrier: { type: ["string", "null"] },
          holder: { type: ["string", "null"] },
          confirmed: { type: ["boolean", "null"] },
          date: { type: ["string", "null"] },
          ref: LLM_REF_SCHEMA,
        },
      },
    },
  },
};

const SYSTEM = `You extract insurance and money facts from a personal-injury case file for a law firm.
Each input record starts with "[id]". For every fact you find, emit one item:
- kind: case_value (attorney's estimate of what the case is worth), coverage (a policy limit layer: BI, UM/UIM, No-fault/PIP, MedPay, Umbrella, Health/Lien, Other), coverage_confirmed (whether limits were confirmed in writing), lien (a lien holder and amount), specials (total medical specials to date).
- Numbers are plain numbers in USD (250000, not "$250k"). perPerson/perAccident for split limits; amount for everything else.
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
  const BATCH_CHARS = 40_000;
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
    for (const f of res.data.facts ?? []) {
      const list = byId.get(f?.ref?.id);
      if (list) { list.push(f); raw.push(f); }
    }
    for (const r of batch) i.cache.set(cacheKey(r), byId.get(r.drawerKey) ?? []);
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

/** Validate refs + numeric-quote rule, then apply precedence; pure, unit-tested. */
export function mergeFacts(raw: RawFact[], records: ClioRecord[]): { facts: ExtractedFacts; droppedRefs: number } {
  let droppedRefs = 0;
  const ok: Hydrated[] = [];
  for (const f of raw) {
    if (!f || !f.ref || typeof f.ref.id !== "string") { droppedRefs++; continue; }
    const numbers = [f.amount, f.perPerson, f.perAccident].filter((n): n is number => typeof n === "number");
    const needsNumber = f.kind !== "coverage_confirmed";
    if (needsNumber && numbers.length === 0) { droppedRefs++; continue; }
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
  for (const [kind, list] of groups) {
    list.sort(sortLatest);
    const w = list[0];
    const perPerson = w.fact.perPerson ?? w.fact.amount;
    const perAccident = w.fact.perAccident;
    const carrier = list.map((h) => h.fact.carrier).find((c) => !!c) ?? null;
    coverage.push({ kind, perPerson, perAccident, carrier, refs: [w.ref] });
    const differing = list.slice(1).filter((h) => (h.fact.perPerson ?? h.fact.amount) !== perPerson || h.fact.perAccident !== perAccident);
    if (differing.length) conflicts.push({ field: "coverage", refs: [w.ref, ...differing.map((h) => h.ref)] });
  }

  const cc = ok.filter((h) => h.fact.kind === "coverage_confirmed" && h.fact.confirmed !== null).sort(sortLatest);
  const coverageConfirmed: ExtractedFacts["coverageConfirmed"] = cc.length
    ? { confirmed: cc[0].fact.confirmed as boolean, on: cc[0].ref.sourceDate ?? cc[0].fact.date, ref: cc[0].ref } : null;

  // liens: one per holder, latest wins.
  const liens: ExtractedFacts["liens"] = [];
  const byHolder = new Map<string, Hydrated[]>();
  for (const h of ok.filter((h) => h.fact.kind === "lien")) {
    const key = (h.fact.holder ?? "unknown").trim().toLowerCase();
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

function displayValue(f: RawFact): string {
  const usd = (n: number) => `$${n.toLocaleString("en-US")}`;
  if (f.kind === "coverage") {
    const a = f.perPerson ?? f.amount; const b = f.perAccident;
    return a !== null ? (b !== null ? `${usd(a)}/${usd(b)}` : usd(a)) : "";
  }
  if (f.kind === "coverage_confirmed") return f.confirmed ? "confirmed" : "not confirmed";
  return f.amount !== null ? usd(f.amount) : "";
}
