// Injuries from scanned documents. Chooser is generic (folder/name patterns, then a cheap Haiku
// classification of first pages). Sonnet reads per-page text with [[PAGE n]] markers; every injury
// keeps only validated page refs. Cached per document version.
import type { AiCall, ClioRecord, Document, DocumentText, ExtractionCache, Injury, LlmRef } from "@/lib/types";
import { validateRefs } from "@/lib/digest";
import { callJson, models } from "./client";
import { byDateDesc, earliest, normName } from "./common";

export const INJURY_EXTRACTOR_VERSION = "injuries-v3";
const CLASSIFY_VERSION = "injury-classify-v1";
export const MAX_INJURY_DOCS = 4;
const PAGES_PER_CHUNK = 25;

// The plaintiff's bill of particulars is the authoritative itemized injury list; prefer it outright.
const PARTICULARS = /bill.?of.?particulars/i;
const TIER1 = /bill.?of.?particulars|particulars|pleading|complaint/i;
const TIER2 = /medical.?records|operative|ortho|radiology/i;

const STATUSES: Injury["status"][] = ["surgery-done", "surgery-recommended", "diagnosed"];

interface RawInjury {
  name: string; bodyPart: string | null; status: Injury["status"]; firstDocumented: string | null;
  refs: { page: number; quote: string | null }[];
}

const INJURIES_SCHEMA = {
  type: "object", additionalProperties: false, required: ["injuries"],
  properties: {
    injuries: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["name", "bodyPart", "status", "firstDocumented", "refs"],
        properties: {
          name: { type: "string" },
          bodyPart: { type: ["string", "null"] },
          status: { type: "string", enum: STATUSES },
          firstDocumented: { type: ["string", "null"] },
          refs: {
            type: "array",
            items: {
              type: "object", additionalProperties: false, required: ["page", "quote"],
              properties: { page: { type: "integer" }, quote: { type: ["string", "null"] } },
            },
          },
        },
      },
    },
  },
};

const INJURIES_SYSTEM = `You read a personal-injury case document, given as page text with "[[PAGE n]]" markers (absolute page numbers).
List each distinct injury or diagnosis attributed to the plaintiff/patient. The text may be ALL CAPS and hard-wrapped; write labels in normal case.
- One item per diagnosis (a tear, a disc bulge, a concussion), not per symptom: fold pain, spasm, reduced range of motion and similar symptoms into the diagnosis they belong to.
- name: short clinical label that reads on its own, including laterality/region (e.g. "Left shoulder posterior labral tear").
- bodyPart: ONE region in Title case, with laterality when stated. Use these labels when they fit: Head, Cervical spine, Thoracic spine, Lumbar spine, Left shoulder, Right shoulder, Left knee, Right knee, Left wrist, Right wrist, Left hand, Right hand, Left hip, Right hip, Left ankle, Right ankle; otherwise a similar short label. Neck injuries are "Cervical spine"; brain, concussion and headache are "Head".
- status: surgery-done if a surgery performed on that body region treated it (repair, reconstruction, debridement, decompression, synovectomy of that region counts for the tears and lesions listed there); surgery-recommended if a surgery is recommended/pending; otherwise diagnosed.
- firstDocumented: the earliest date (YYYY-MM-DD) stated for it in this document, or null.
- refs: one or more {page, quote}: the page where it is stated and a short VERBATIM substring (5-15 words) copied exactly from that page, in its original case.
Only list injuries explicitly stated in the text. Do not invent pages or quotes.`;

const CLASSIFY_SCHEMA = {
  type: "object", additionalProperties: false, required: ["describesInjuries"],
  properties: { describesInjuries: { type: "boolean" } },
};

function docName(d: Document): string { return `${d.folder ?? ""}/${d.filename || d.name}`; }

/** Generic chooser. Tier 1 (pleadings) first; else tier 2 (medical); else caller classifies. */
export function chooseInjuryDocuments(docs: Document[]): { chosen: Document[]; needsClassification: boolean } {
  // A document known to have no text layer cannot yield verifiable quotes.
  const sorted = [...docs].filter((d) => d.textLayer !== false).sort(byDateDesc);
  const bop = sorted.filter((d) => PARTICULARS.test(d.filename || d.name));
  if (bop.length) return { chosen: bop.slice(0, MAX_INJURY_DOCS), needsClassification: false };
  const t1 = sorted.filter((d) => TIER1.test(docName(d)));
  if (t1.length) return { chosen: t1.slice(0, MAX_INJURY_DOCS), needsClassification: false };
  const t2 = sorted.filter((d) => TIER2.test(docName(d)));
  if (t2.length) return { chosen: t2.slice(0, MAX_INJURY_DOCS), needsClassification: false };
  return { chosen: [], needsClassification: true };
}

function versionKey(d: Document, extractorVersion: string) {
  return { sourceType: "document" as const, clioId: d.clioId, contentHash: d.latestVersionId ?? d.contentHash, extractorVersion };
}

export function pageChunks(text: DocumentText): { first: number; body: string; hasText: boolean }[] {
  const chunks: { first: number; body: string; hasText: boolean }[] = [];
  for (let i = 0; i < text.pages.length; i += PAGES_PER_CHUNK) {
    const slice = text.pages.slice(i, i + PAGES_PER_CHUNK);
    const body = slice.map((p, j) => `[[PAGE ${i + j + 1}]]\n${p}`).join("\n\n");
    chunks.push({ first: i + 1, body, hasText: slice.some((p) => p.trim().length > 0) });
  }
  return chunks;
}

export interface InjuriesResult { injuries: Injury[]; droppedRefs: number; warnings: string[]; documents: string[] }

export async function extractInjuriesDetailed(i: {
  records: ClioRecord[]; docTexts: DocumentText[]; cache: ExtractionCache; log: (c: AiCall) => void; matterId?: string | null;
}): Promise<InjuriesResult> {
  const warnings: string[] = [];
  const textById = new Map(i.docTexts.map((t) => [t.clioId, t]));
  const docs = i.records.filter((r): r is Document => r.sourceType === "document" && textById.has(r.clioId));
  const matterId = i.matterId ?? docs[0]?.matterId ?? null;

  const choice = chooseInjuryDocuments(docs);
  let chosen = choice.chosen;
  const needsClassification = choice.needsClassification;
  if (needsClassification) {
    const relevant: Document[] = [];
    for (const d of [...docs].sort(byDateDesc)) {
      if (relevant.length >= MAX_INJURY_DOCS) break;
      const key = versionKey(d, CLASSIFY_VERSION);
      let verdict = i.cache.get(key);
      if (typeof verdict !== "boolean") {
        const firstPage = (textById.get(d.clioId)?.pages[0] ?? "").slice(0, 3000);
        if (!firstPage.trim()) continue;
        const res = await callJson<{ describesInjuries: boolean }>({
          stage: "classify_document", model: models().extract, matterId, log: i.log, maxTokens: 200,
          system: "Answer whether this first page of a legal/medical document describes a person's physical injuries or diagnoses (pleadings, bills of particulars, medical records, operative or radiology reports).",
          user: `Document name: ${docName(d)}\n\n${firstPage}`, schema: CLASSIFY_SCHEMA,
        });
        if (!res.data) { if (res.warning) warnings.push(res.warning); continue; }
        verdict = !!res.data.describesInjuries;
        i.cache.set(key, verdict);
      }
      if (verdict) relevant.push(d);
    }
    chosen = relevant;
  }

  const raw: { doc: Document; injuries: RawInjury[] }[] = [];
  for (const d of chosen) {
    const key = versionKey(d, INJURY_EXTRACTOR_VERSION);
    const hit = i.cache.get(key);
    if (Array.isArray(hit)) { raw.push({ doc: d, injuries: hit as RawInjury[] }); continue; }
    const text = textById.get(d.clioId)!;
    const found: RawInjury[] = [];
    let failed = false;
    for (const chunk of pageChunks(text).filter((c) => c.hasText)) {
      const res = await callJson<{ injuries: RawInjury[] }>({
        stage: "extract_injuries", model: models().scan, matterId, log: i.log, maxTokens: 6000,
        system: INJURIES_SYSTEM,
        user: `Document: ${docName(d)} (${text.pageCount} pages; this part starts at page ${chunk.first})\n\n${chunk.body}`,
        schema: INJURIES_SCHEMA,
      });
      if (!res.data) { failed = true; if (res.warning) warnings.push(res.warning); continue; }
      found.push(...(res.data.injuries ?? []));
    }
    if (!failed) i.cache.set(key, found);
    raw.push({ doc: d, injuries: found });
  }

  const merged = mergeInjuries(raw, i.records, i.docTexts);
  return { injuries: merged.injuries, droppedRefs: merged.droppedRefs, warnings, documents: chosen.map((d) => d.drawerKey) };
}

export async function extractInjuries(i: {
  records: ClioRecord[]; docTexts: DocumentText[]; cache: ExtractionCache; log: (c: AiCall) => void;
}): Promise<Injury[]> {
  return (await extractInjuriesDetailed(i)).injuries;
}

const STATUS_RANK: Record<Injury["status"], number> = { "surgery-done": 3, "surgery-recommended": 2, diagnosed: 1 };

/** Hydrate page refs via the validator; keep injuries with >= 1 verified page ref; merge by name. */
export function mergeInjuries(
  raw: { doc: Document; injuries: RawInjury[] }[], records: ClioRecord[], docTexts: DocumentText[],
): { injuries: Injury[]; droppedRefs: number } {
  let droppedRefs = 0;
  const byName = new Map<string, Injury>();
  for (const { doc, injuries } of raw) {
    for (const inj of injuries ?? []) {
      if (!inj || typeof inj.name !== "string" || !inj.name.trim()) continue;
      const llmRefs: LlmRef[] = (inj.refs ?? [])
        .filter((r) => r && Number.isInteger(r.page))
        .map((r) => ({ id: `document:${doc.clioId}`, quote: r.quote ?? null, page: r.page }));
      droppedRefs += (inj.refs?.length ?? 0) - llmRefs.length;
      const v = validateRefs(llmRefs, records, docTexts);
      droppedRefs += v.dropped;
      const paged = v.refs.filter((r) => typeof r.page === "number");
      droppedRefs += v.refs.length - paged.length;
      const pageSeen = new Set<number>();
      const refs = paged.filter((r) => !pageSeen.has(r.page!) && pageSeen.add(r.page!)).map((r) => ({ ...r, value: inj.name }));
      if (refs.length === 0) continue;
      const status: Injury["status"] = STATUSES.includes(inj.status) ? inj.status : "diagnosed";
      const key = normName(`${inj.bodyPart ?? ""} ${inj.name}`);
      const prev = byName.get(key);
      if (!prev) {
        byName.set(key, { name: inj.name.trim(), bodyPart: inj.bodyPart ?? null, status, firstDocumented: inj.firstDocumented ?? null, refs });
      } else {
        const seen = new Set(prev.refs.map((r) => `${r.clioId}#${r.page}`));
        prev.refs.push(...refs.filter((r) => !seen.has(`${r.clioId}#${r.page}`)));
        prev.bodyPart = prev.bodyPart ?? inj.bodyPart ?? null;
        prev.firstDocumented = earliest(prev.firstDocumented, inj.firstDocumented ?? null);
        if (STATUS_RANK[status] > STATUS_RANK[prev.status]) prev.status = status;
      }
    }
  }
  return { injuries: [...byName.values()], droppedRefs };
}
