// One Sonnet synthesis call: brief claims, a why-line per code-ranked top-ten id, open questions,
// client status chips. Every claim's refs go through the validator; >20% dropped => one retry.
import type { AiCall, Claim, ClioRecord, DocumentText, LlmRef, Matter, Note, SynthesisOutput } from "@/lib/types";
import { validateRefs } from "@/lib/digest";
import { approxTokens, callJson, CLAIM_SCHEMA, models } from "./client";
import { byDateDesc, recordBlock } from "./common";

export const SYNTH_VERSION = "synth-v1";
const INPUT_TOKEN_BUDGET = 15_000;

// A note the attorney wrote as a standing summary of where the case is. Generic subject words.
const POSTURE_SUBJECT = /\b(posture|summary|status|evaluation|strategy|overview|memo|where we are|state of the case)\b/i;

interface RawSynthesis {
  brief: { text: string; refs: LlmRef[] }[];
  whys: { id: string; why: string }[];
  openQuestions: { text: string; refs: LlmRef[] }[];
  statusChips: { text: string; refs: LlmRef[] }[];
}

const SYNTH_SCHEMA = {
  type: "object", additionalProperties: false, required: ["brief", "whys", "openQuestions", "statusChips"],
  properties: {
    brief: { type: "array", items: CLAIM_SCHEMA },
    whys: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["id", "why"], properties: { id: { type: "string" }, why: { type: "string" } } },
    },
    openQuestions: { type: "array", items: CLAIM_SCHEMA },
    statusChips: { type: "array", items: CLAIM_SCHEMA },
  },
};

const SYSTEM = `You brief a personal-injury attorney who is opening a case file they have not looked at in a while.
Input: the matter header, custom fields, optionally the most recent posture note verbatim, a list of the ten items code already ranked as most important, and recent records. Every record starts with "[id]".
Output:
- brief: 3 to 5 sentences that let a colleague take over the case. Each sentence is one claim with refs.
- whys: for EACH of the listed top-ten ids, one line (max 18 words) saying why that item matters now. Use the id exactly as given.
- openQuestions: 2 to 5 things that are unresolved, missing or contradictory in the file, each with refs.
- statusChips: 2 to 4 short client-status phrases (e.g. still treating, out of work, surgery pending), each with refs.
Rules: a ref is {id, quote} where id is one of the given "[id]" values and quote is a VERBATIM substring of that record's text (null only for structured records such as tasks, calendar entries, expenses or custom fields). Never invent ids or quotes. Do not state dollar figures or dates unless they appear in the quote. Write for an attorney; no preamble.`;

export function findPostureNote(records: ClioRecord[]): Note | null {
  const notes = records.filter((r): r is Note => r.sourceType === "note" && POSTURE_SUBJECT.test(r.subject || r.title));
  return notes.sort(byDateDesc)[0] ?? null;
}

export function buildSynthesisPrompt(i: { matter: Matter; records: ClioRecord[]; topIds: string[] }): string {
  const m = i.matter;
  const byKey = new Map(i.records.map((r) => [r.drawerKey, r]));
  const parts: string[] = [];
  parts.push(`MATTER [${m.drawerKey}] ${m.displayNumber} — ${m.description}\nstatus ${m.status}; practice area ${m.practiceArea ?? "n/a"}; Clio stage ${m.clioStage ?? "n/a"}; opened ${m.openDate ?? "n/a"}; SOL ${m.sol?.dueAt ?? "n/a"} (${m.sol?.status ?? "n/a"})`);
  const cfs = [...(m.customFields ?? []), ...i.records.filter((r) => r.sourceType === "custom_field")];
  const seen = new Set<string>();
  const cfLines = cfs.filter((c) => !seen.has(c.drawerKey) && seen.add(c.drawerKey))
    .map((c) => `[${c.drawerKey}] ${c.sourceType === "custom_field" ? c.name : c.title}: ${c.sourceType === "custom_field" ? c.display : c.bodyText}`);
  if (cfLines.length) parts.push(`CUSTOM FIELDS\n${cfLines.join("\n")}`);
  const posture = findPostureNote(i.records);
  if (posture) parts.push(`MOST RECENT POSTURE NOTE (verbatim)\n${recordBlock(posture, 6000)}`);
  const top = i.topIds.map((id) => { const r = byKey.get(id); return `[${id}] ${r ? `${r.sourceDate ?? "undated"} · ${r.sourceType} · ${r.title}` : "(not in records)"}`; });
  parts.push(`TOP TEN (code-ranked; give a why for each id)\n${top.join("\n")}`);

  let used = approxTokens(parts.join("\n\n"));
  const recent = i.records
    .filter((r) => r.sourceType !== "matter" && r.sourceType !== "custom_field" && r.drawerKey !== posture?.drawerKey)
    .sort(byDateDesc);
  const lines: string[] = [];
  for (const r of recent) {
    const block = recordBlock(r, 1200);
    const t = approxTokens(block);
    if (used + t > INPUT_TOKEN_BUDGET) continue;
    used += t; lines.push(block);
  }
  parts.push(`RECORDS (most recent first)\n${lines.join("\n\n")}`);
  return parts.join("\n\n");
}

export interface SynthesisResult { output: SynthesisOutput; droppedRefs: number; droppedClaims: number; warnings: string[] }

export async function synthesizeDetailed(i: {
  matter: Matter; records: ClioRecord[]; topIds: string[]; log: (c: AiCall) => void; docTexts?: DocumentText[];
}): Promise<SynthesisResult> {
  const warnings: string[] = [];
  const known = new Set(i.records.map((r) => r.drawerKey));
  const basePrompt = buildSynthesisPrompt(i);
  let prompt = basePrompt;
  let best: ReturnType<typeof validateSynthesis> | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await callJson<RawSynthesis>({
      stage: "synthesize", model: models().synth, system: SYSTEM, user: prompt, schema: SYNTH_SCHEMA,
      matterId: i.matter.matterId, log: i.log, maxTokens: 6000,
    });
    if (!res.data) { if (res.warning) warnings.push(res.warning); break; }
    const v = validateSynthesis(res.data, i.records, i.docTexts ?? [], i.topIds);
    if (!best || v.droppedRefs < best.droppedRefs) best = v;
    if (v.total === 0 || v.droppedRefs / v.total <= 0.2) break;
    if (attempt === 0) {
      const badIds = [...v.badIds].filter((id) => !known.has(id));
      prompt = `${basePrompt}\n\nPREVIOUS ATTEMPT REJECTED: ${v.droppedRefs} of ${v.total} refs failed validation` +
        (badIds.length ? ` (unknown ids: ${badIds.join(", ")})` : "") +
        `. Use only the "[id]" values given above and copy quotes verbatim from the record text.`;
    } else {
      warnings.push(`synthesize: ${v.droppedRefs}/${v.total} refs dropped after retry`);
    }
  }
  if (!best) {
    return { output: { brief: [], whys: {}, openQuestions: [], statusChips: [] }, droppedRefs: 0, droppedClaims: 0, warnings };
  }
  return { output: best.output, droppedRefs: best.droppedRefs, droppedClaims: best.droppedClaims, warnings };
}

export async function synthesize(i: {
  matter: Matter; records: ClioRecord[]; topIds: string[]; log: (c: AiCall) => void; docTexts?: DocumentText[];
}): Promise<SynthesisOutput> {
  return (await synthesizeDetailed(i)).output;
}

export function validateSynthesis(raw: RawSynthesis, records: ClioRecord[], docTexts: DocumentText[], topIds: string[]) {
  let droppedRefs = 0, droppedClaims = 0, total = 0;
  const badIds = new Set<string>();
  const known = new Set(records.map((r) => r.drawerKey));
  const claims = (list: { text: string; refs: LlmRef[] }[] | undefined): Claim[] => {
    const out: Claim[] = [];
    for (const c of list ?? []) {
      if (!c || typeof c.text !== "string" || !c.text.trim()) continue;
      const refs = (c.refs ?? []).filter((r) => r && typeof r.id === "string");
      total += refs.length;
      for (const r of refs) if (!known.has(r.id)) badIds.add(r.id);
      const v = validateRefs(refs, records, docTexts);
      droppedRefs += v.dropped;
      if (v.refs.length === 0) { droppedClaims++; continue; }
      out.push({ text: c.text.trim(), refs: v.refs.map((ref) => ({ ...ref, value: ref.value || c.text.trim() })) });
    }
    return out;
  };
  const brief = claims(raw.brief);
  const openQuestions = claims(raw.openQuestions);
  const statusChips = claims(raw.statusChips);
  const wanted = new Set(topIds);
  const whys: Record<string, string> = {};
  for (const w of raw.whys ?? []) {
    if (w && typeof w.id === "string" && wanted.has(w.id) && typeof w.why === "string" && w.why.trim()) whys[w.id] = w.why.trim();
  }
  return { output: { brief, whys, openQuestions, statusChips } as SynthesisOutput, droppedRefs, droppedClaims, total, badIds };
}
