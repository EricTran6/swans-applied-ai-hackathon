// Test-only helpers: synthetic records (fake client), fake validator mirroring contract section 5,
// and SDK response builders. Never imported by runtime code.
import fs from "node:fs";
import path from "node:path";
import type {
  ChangeEntry, ClioRecord, CustomFieldValue, Document, DocumentText, ExtractedFacts, ExtractionCache, ExtractionKey,
  LlmRef, Matter, Note, SourceRef,
} from "@/lib/types";
import type { DeterministicDigest } from "@/lib/digest";

const T = "2026-10-02T10:00:00Z";
const base = (sourceType: ClioRecord["sourceType"], clioId: string, title: string, bodyText: string, sourceDate: string | null) => ({
  sourceType, clioId, matterId: "m1", createdAt: T, updatedAt: T, sourceDate, title, bodyText,
  drawerKey: `${sourceType}:${clioId}`, etag: null, contentHash: `h-${sourceType}-${clioId}-${bodyText.length}`,
});

export function makeNote(clioId: string, subject: string, date: string | null, body: string): Note {
  return { ...base("note", clioId, subject, body, date), sourceType: "note", subject, date, author: null };
}
export function makeCustomField(clioId: string, name: string, display: string, value: string | number | boolean | null = display): CustomFieldValue {
  return { ...base("custom_field", clioId, name, display, null), sourceType: "custom_field", fieldId: clioId, name, fieldType: "text_line", value, display };
}
export function makeMatter(customFields: CustomFieldValue[] = []): Matter {
  return {
    ...base("matter", "m1", "Doe, Jane - test matter", "", null), sourceType: "matter", displayNumber: "00001-Doe",
    description: "Doe, Jane - test matter", status: "Open", openDate: "2024-01-01", closeDate: null, practiceArea: "Personal Injury",
    clioStage: null, sol: null, responsibleAttorney: null, client: { contactId: "c1", name: "Jane Doe", kind: "Person" }, customFields,
  };
}
export function makeDoc(clioId: string, name: string, folder: string | null, pageCount: number | null, date: string | null = null): Document {
  return {
    ...base("document", clioId, name, "", date), sourceType: "document", name, filename: name, contentType: "application/pdf", size: null,
    folder, receivedAt: date, latestVersionId: `v-${clioId}`, latestVersionUuid: null, pageCount, textLayer: true,
  };
}
export function makeDocText(clioId: string, pages: string[]): DocumentText {
  return { clioId, versionUuid: null, pageCount: pages.length, pages };
}

/** Raw Clio document rows from the synthetic fixtures, normalized just enough for the chooser. */
export function fixtureDocuments(): Document[] {
  const file = path.join(process.cwd(), "fixtures", "clio", "documents.json");
  const rows = JSON.parse(fs.readFileSync(file, "utf8")) as { id: number; name: string; parent?: { name?: string } | null; received_at?: string | null }[];
  return rows.map((r) => makeDoc(String(r.id), r.name, r.parent?.name ?? null, 5, r.received_at ?? null));
}

// Contract section 5 rules, simplified: known id, normalized substring quote, page in range.
const norm = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim().toLowerCase();
export function fakeValidateRefs(refs: LlmRef[], records: ClioRecord[], docTexts: DocumentText[]): { refs: SourceRef[]; dropped: number } {
  const byKey = new Map(records.map((r) => [r.drawerKey, r]));
  const out: SourceRef[] = []; let dropped = 0;
  for (const ref of refs) {
    const r = byKey.get(ref.id);
    if (!r) { dropped++; continue; }
    if (r.sourceType === "document") {
      const text = docTexts.find((t) => t.clioId === r.clioId);
      const pc = text?.pageCount ?? r.pageCount ?? 0;
      if (ref.page === undefined || ref.page < 1 || ref.page > pc) { dropped++; continue; }
      out.push({ value: "", sourceType: r.sourceType, clioId: r.clioId, sourceDate: r.sourceDate, quote: ref.quote, page: ref.page,
        drawerKey: `${r.drawerKey}#p${ref.page}`, derivation: "stated", quoteVerified: false });
      continue;
    }
    const structured = ["task", "calendar_entry", "expense", "custom_field", "matter"].includes(r.sourceType);
    if (ref.quote === null) {
      if (!structured) { dropped++; continue; }
      out.push({ value: "", sourceType: r.sourceType, clioId: r.clioId, sourceDate: r.sourceDate, quote: null, drawerKey: r.drawerKey, derivation: "clio-metadata", quoteVerified: false });
      continue;
    }
    if (!norm(r.bodyText).includes(norm(ref.quote))) { dropped++; continue; }
    out.push({ value: "", sourceType: r.sourceType, clioId: r.clioId, sourceDate: r.sourceDate, quote: ref.quote, drawerKey: r.drawerKey, derivation: "stated", quoteVerified: true });
  }
  return { refs: out, dropped };
}

export function fakeInputSetHash(records: ClioRecord[]): string {
  return "hash:" + records.map((r) => r.contentHash).sort().join("|");
}

export function fakeComputeDeterministic(input: { matter: Matter; records: ClioRecord[]; facts: ExtractedFacts | null; changeFeed: ChangeEntry[]; now: Date }): DeterministicDigest {
  const ranked = input.records.filter((r) => r.sourceType === "note").slice(0, 10);
  return {
    matterId: input.matter.matterId,
    header: { clientName: "Jane Doe", clientInitials: "JD", displayNumber: input.matter.displayNumber, description: input.matter.description,
      status: input.matter.status, matterUrl: null, incidentDate: null, sol: null },
    client: { name: "Jane Doe", initials: "JD", age: null, avatarUrl: null, lastContact: null, nextTouchpoint: null, statusChips: [] },
    kpis: [], coverage: input.facts?.coverage ?? [], valueWaterfall: [], providerBills: [],
    topTen: ranked.map((r, idx) => ({ rank: idx + 1, score: 10 - idx, title: r.title, why: "", category: "other" as const, date: r.sourceDate,
      ref: { value: r.title, sourceType: r.sourceType, clioId: r.clioId, sourceDate: r.sourceDate, quote: null, drawerKey: r.drawerKey, derivation: "clio-metadata" as const, quoteVerified: false } })),
    totalItems: input.records.length,
    actionBoard: { overdue: [], upcoming: [], waiting: [], suggested: [] },
    timeline: [], stage: { key: "treatment", label: "Treatment", evidence: [], inferred: true }, changeFeed: input.changeFeed,
  };
}

export class MemoryCache implements ExtractionCache {
  map = new Map<string, unknown>();
  key(k: ExtractionKey) { return `${k.sourceType}|${k.clioId}|${k.contentHash}|${k.extractorVersion}`; }
  get(k: ExtractionKey) { return this.map.has(this.key(k)) ? this.map.get(this.key(k)) : null; }
  set(k: ExtractionKey, v: unknown) { this.map.set(this.key(k), v); }
}

/** Build a fake SDK Message. */
export function sdkJson(obj: unknown, usage: Partial<{ input_tokens: number; output_tokens: number; cache_read_input_tokens: number }> = {},
  opts: { stop_reason?: string; model?: string } = {}) {
  return {
    id: "msg_test", type: "message", role: "assistant", model: opts.model ?? "claude-test",
    content: [{ type: "text", text: JSON.stringify(obj) }],
    stop_reason: opts.stop_reason ?? "end_turn", stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, ...usage },
  };
}
