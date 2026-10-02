// AI digestion pipeline (owner T03). Claude is used for extraction and synthesis only; all math,
// ranking and lanes come from src/lib/digest. Every ref is validated; every call's cost is logged.
import type { AiCall, ChangeEntry, ClioRecord, Digest, DocumentText, ExtractionCache, Matter } from "@/lib/types";
import { computeDeterministic, DIGEST_CORE_VERSION, inputSetHash } from "@/lib/digest";
import { models } from "./client";
import { extractFactsDetailed, FACTS_EXTRACTOR_VERSION } from "./facts";
import { extractInjuriesDetailed, INJURY_EXTRACTOR_VERSION } from "./injuries";
import { SYNTH_VERSION, synthesizeDetailed } from "./synthesize";

export { extractFacts, extractFactsDetailed, FACTS_EXTRACTOR_VERSION } from "./facts";
export { extractInjuries, extractInjuriesDetailed, chooseInjuryDocuments, INJURY_EXTRACTOR_VERSION } from "./injuries";
export { synthesize, synthesizeDetailed, SYNTH_VERSION } from "./synthesize";
export { models, priceUsd, PRICES } from "./client";

export const PIPELINE_VERSION = `${FACTS_EXTRACTOR_VERSION}+${INJURY_EXTRACTOR_VERSION}+${SYNTH_VERSION}+${DIGEST_CORE_VERSION}`;

// Warnings that mean a stage did not run (transient); such a digest must not be served from cache.
const TRANSIENT_FAILURE = /API error|model refused|output truncated|unparseable JSON|no output/;

/** A previous digest is reusable only for the same inputs, same pipeline, and no failed AI stage. */
export function isReusable(prev: Digest | null, hash: string): prev is Digest {
  if (!prev || prev.inputSetHash !== hash) return false;
  if (prev.meta?.models?.pipeline !== PIPELINE_VERSION) return false;
  return !(prev.meta?.warnings ?? []).some((w) => TRANSIENT_FAILURE.test(w));
}

const FACT_KPIS = new Set(["case_value", "coverage"]);
export function markUnextracted(kpis: Digest["kpis"]): Digest["kpis"] {
  return kpis.map((k) => (FACT_KPIS.has(k.key) && k.value == null
    ? { ...k, display: "Not extracted (AI error)", note: "Fact extraction failed on the last build; rebuild to retry." } : k));
}

export async function buildDigest(i: {
  matter: Matter; records: ClioRecord[]; docTexts: DocumentText[]; changeFeed: ChangeEntry[];
  prev: Digest | null; cache: ExtractionCache; log: (c: AiCall) => void; now: Date;
}): Promise<Omit<Digest, "version">> {
  const hash = inputSetHash(i.records);
  if (isReusable(i.prev, hash)) {
    const { version: _version, ...rest } = i.prev;
    void _version;
    return { ...rest, meta: { ...rest.meta, cached: true } };
  }

  let costUsd = 0;
  const log = (c: AiCall) => { costUsd += c.usd; i.log(c); };
  const warnings: string[] = [];
  let droppedRefs = 0;

  const facts = await extractFactsDetailed({ matter: i.matter, records: i.records, cache: i.cache, log });
  droppedRefs += facts.droppedRefs; warnings.push(...facts.warnings);

  const det = computeDeterministic({ matter: i.matter, records: i.records, facts: facts.facts, changeFeed: i.changeFeed, now: i.now });
  const topIds = det.topTen.map((t) => t.ref.drawerKey);

  const [inj, syn] = await Promise.all([
    extractInjuriesDetailed({ records: i.records, docTexts: i.docTexts, cache: i.cache, log, matterId: i.matter.matterId }),
    synthesizeDetailed({ matter: i.matter, records: i.records, topIds, log, docTexts: i.docTexts }),
  ]);
  droppedRefs += inj.droppedRefs + syn.droppedRefs;
  warnings.push(...inj.warnings, ...syn.warnings);

  // When fact extraction failed, an empty money KPI means "not extracted", not "not in Clio".
  const factsFailed = facts.warnings.some((w) => w.startsWith("extract_facts") && TRANSIENT_FAILURE.test(w));
  const kpis = factsFailed ? markUnextracted(det.kpis) : det.kpis;
  const topTen = det.topTen.map((t) => ({ ...t, why: syn.output.whys[t.ref.drawerKey] ?? t.why }));
  const client = { ...det.client, statusChips: syn.output.statusChips.length ? syn.output.statusChips : det.client.statusChips };
  const m = models();

  return {
    ...det,
    matterId: i.matter.matterId,
    createdAt: i.now.toISOString(),
    inputSetHash: hash,
    kpis,
    client,
    topTen,
    brief: syn.output.brief,
    openQuestions: syn.output.openQuestions,
    injuries: inj.injuries,
    meta: {
      models: { extract: m.extract, synth: m.synth, scan: m.scan, pipeline: PIPELINE_VERSION },
      costUsd: Number(costUsd.toFixed(6)),
      droppedRefs,
      droppedClaims: syn.droppedClaims,
      warnings,
      builtAt: i.now.toISOString(),
    },
  };
}
