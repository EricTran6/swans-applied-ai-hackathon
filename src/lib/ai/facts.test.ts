import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeCustomField, makeMatter, makeNote, MemoryCache, sdkJson } from "./__tests__/helpers";

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error { status?: number }
  class Anthropic { messages = { create: createMock }; static APIError = APIError }
  return { default: Anthropic };
});
vi.mock("@/lib/digest", async () => {
  const h = await import("./__tests__/helpers");
  return { validateRefs: h.fakeValidateRefs, computeDeterministic: h.fakeComputeDeterministic, inputSetHash: h.fakeInputSetHash, diffSince: () => [] };
});

import { extractFactsDetailed, FACTS_SCHEMA, mergeFacts, selectFactRecords, type RawFact } from "./facts";

const noteOld = makeNote("1", "Insurance", "2024-03-20", "Carrier says liability limits are $100,000/$300,000 per the adjuster.");
const noteNew = makeNote("2", "Coverage", "2026-09-05", "Adjuster confirmed in writing: liability limits $250,000/$500,000.");
const noteLien = makeNote("3", "Lien", "2025-02-02", "State program asserted a lien of $9,400.");
const noteChat = makeNote("4", "Call", "2025-03-01", "Client called to ask about her next appointment.");
const noteSelf = makeNote("5", "Coverage", "2023-05-14", "The defendant is self-insured; there is no carrier and no declarations page.");
const noteNf = makeNote("6", "No-fault", "2024-01-08", "Carrier confirms the client's no-fault benefits are exhausted.");
const cfValue = makeCustomField("cv", "Estimated Case Value", "$600,000", 600000);
const matter = makeMatter([cfValue]);
const records = [matter, cfValue, noteOld, noteNew, noteLien, noteChat, noteSelf, noteNf];

const fact = (p: Partial<RawFact> & { ref: RawFact["ref"]; kind: RawFact["kind"] }): RawFact => ({
  amount: null, perPerson: null, perAccident: null, coverageKind: null, carrier: null, holder: null, confirmed: null,
  exhausted: null, selfInsured: null, date: null, ...p,
});

describe("selectFactRecords", () => {
  it("takes custom fields and only notes mentioning money/coverage vocabulary", () => {
    const keys = selectFactRecords(matter, records).map((r) => r.drawerKey);
    expect(keys).toContain("custom_field:cv");
    expect(keys).toContain("note:1");
    expect(keys).toContain("note:3");
    expect(keys).not.toContain("note:4");
  });
});

describe("mergeFacts", () => {
  it("drops a hallucinated id", () => {
    const r = mergeFacts([fact({ kind: "lien", amount: 9400, holder: "X", ref: { id: "note:999", quote: "lien of $9,400" } })], records);
    expect(r.facts.liens).toHaveLength(0);
    expect(r.droppedRefs).toBe(1);
  });

  it("drops a numeric fact whose quote does not contain the number", () => {
    const r = mergeFacts([fact({ kind: "lien", amount: 9400, holder: "X", ref: { id: "note:3", quote: "asserted a lien" } })], records);
    expect(r.facts.liens).toHaveLength(0);
    expect(r.droppedRefs).toBe(1);
  });

  it("keeps a numeric fact with a verified quote containing the number", () => {
    const r = mergeFacts([fact({ kind: "lien", amount: 9400, holder: "State program", ref: { id: "note:3", quote: "lien of $9,400" } })], records);
    expect(r.facts.liens).toEqual([expect.objectContaining({ holder: "State program", amount: 9400 })]);
    expect(r.facts.liens[0].ref.quoteVerified).toBe(true);
  });

  it("latest-dated coverage wins; the older contradicting source goes to conflicts", () => {
    const r = mergeFacts([
      fact({ kind: "coverage", coverageKind: "BI", perPerson: 100000, perAccident: 300000, ref: { id: "note:1", quote: "$100,000/$300,000" } }),
      fact({ kind: "coverage", coverageKind: "BI", perPerson: 250000, perAccident: 500000, ref: { id: "note:2", quote: "$250,000/$500,000" } }),
    ], records);
    expect(r.facts.coverage).toHaveLength(1);
    expect(r.facts.coverage[0]).toMatchObject({ kind: "BI", perPerson: 250000, perAccident: 500000 });
    expect(r.facts.coverage[0].refs[0].clioId).toBe("2");
    expect(r.facts.conflicts).toEqual([expect.objectContaining({ field: "coverage" })]);
    expect(r.facts.conflicts[0].refs.map((x) => x.clioId)).toEqual(["2", "1"]);
  });

  it("marks a layer exhausted even when the exhaustion note states no number", () => {
    const r = mergeFacts([
      fact({ kind: "coverage", coverageKind: "No-fault/PIP", amount: 50000, ref: { id: "note:1", quote: "$100,000" } }), // dropped: number not in quote
      fact({ kind: "coverage", coverageKind: "No-fault/PIP", exhausted: true, ref: { id: "note:6", quote: "no-fault benefits are exhausted" } }),
    ], records);
    expect(r.facts.coverage).toEqual([expect.objectContaining({ kind: "No-fault/PIP", exhausted: true })]);
  });

  it("keeps the latest numeric limit and flags an older self-insured statement as a conflict", () => {
    const r = mergeFacts([
      fact({ kind: "coverage", coverageKind: "BI", selfInsured: true, ref: { id: "note:5", quote: "self-insured; there is no carrier" } }),
      fact({ kind: "coverage", coverageKind: "BI", perPerson: 250000, perAccident: 500000, ref: { id: "note:2", quote: "$250,000/$500,000" } }),
    ], records);
    expect(r.facts.coverage[0]).toMatchObject({ kind: "BI", perPerson: 250000 });
    expect(r.facts.conflicts).toEqual([expect.objectContaining({ field: "coverage" })]);
    expect(r.facts.conflicts[0].refs.map((x) => x.clioId)).toEqual(["2", "5"]);
  });

  it("keeps a self-insured statement whose quote lacks the model's number, as a conflict against the stated limit", () => {
    const r = mergeFacts([
      fact({ kind: "coverage", coverageKind: "BI", perPerson: 250000, selfInsured: true, ref: { id: "note:5", quote: "self-insured; there is no carrier" } }),
      fact({ kind: "coverage", coverageKind: "BI", perPerson: 250000, perAccident: 500000, ref: { id: "note:2", quote: "$250,000/$500,000" } }),
    ], records);
    expect(r.droppedRefs).toBe(0);
    expect(r.facts.conflicts[0].refs.map((x) => x.clioId)).toEqual(["2", "5"]);
  });

  it("drops a coverage fact with no number unless it states exhaustion or self-insurance", () => {
    const r = mergeFacts([fact({ kind: "coverage", coverageKind: "BI", ref: { id: "note:5", quote: "self-insured" } })], records);
    expect(r.facts.coverage).toHaveLength(0);
    expect(r.droppedRefs).toBe(1);
  });

  it("treats confirmed=true on a BI coverage item as written confirmation", () => {
    const r = mergeFacts([fact({ kind: "coverage", coverageKind: "BI", perPerson: 250000, perAccident: 500000, confirmed: true,
      ref: { id: "note:2", quote: "confirmed in writing: liability limits $250,000/$500,000" } })], records);
    expect(r.facts.coverageConfirmed).toMatchObject({ confirmed: true, on: "2026-09-05" });
  });

  it("does not flag a source that omits the per-accident figure as a conflict", () => {
    const r = mergeFacts([
      fact({ kind: "coverage", coverageKind: "BI", perPerson: 250000, perAccident: 500000, ref: { id: "note:2", quote: "$250,000/$500,000" } }),
      fact({ kind: "coverage", coverageKind: "BI", perPerson: 250000, ref: { id: "note:2", quote: "$250,000" } }),
    ], records);
    expect(r.facts.conflicts).toEqual([]);
  });

  it("merges the same lien holder written two ways", () => {
    const r = mergeFacts([
      fact({ kind: "lien", amount: 9400, holder: "Medicaid", ref: { id: "note:3", quote: "lien of $9,400" } }),
      fact({ kind: "lien", amount: 9400, holder: "State Medicaid Program", ref: { id: "note:3", quote: "lien of $9,400" } }),
    ], records);
    expect(r.facts.liens).toHaveLength(1);
  });

  it("attorney custom field beats a quoted note for case value", () => {
    const r = mergeFacts([
      fact({ kind: "case_value", amount: 500000, date: "2026-09-30", ref: { id: "note:2", quote: "$250,000" } }), // number mismatch -> dropped
      fact({ kind: "case_value", amount: 600000, ref: { id: "custom_field:cv", quote: "$600,000" } }),
    ], records);
    expect(r.facts.caseValue?.amount).toBe(600000);
    expect(r.facts.caseValue?.ref.sourceType).toBe("custom_field");
    expect(r.droppedRefs).toBe(1);
  });
});

describe("FACTS_SCHEMA", () => {
  it("never puts an enum under a nullable type array (the API rejects that)", () => {
    const walk = (n: unknown): void => {
      if (!n || typeof n !== "object") return;
      const o = n as Record<string, unknown>;
      if (Array.isArray(o.type) && "enum" in o) throw new Error(`enum with type array: ${JSON.stringify(o)}`);
      Object.values(o).forEach(walk);
    };
    expect(() => walk(FACTS_SCHEMA)).not.toThrow();
  });
});

describe("extractFactsDetailed", () => {
  beforeEach(() => { createMock.mockReset(); });

  it("calls Haiku once for uncached records, caches per record, and makes zero calls on a rerun", async () => {
    createMock.mockResolvedValueOnce(sdkJson({ facts: [
      { kind: "lien", amount: 9400, perPerson: null, perAccident: null, coverageKind: null, carrier: null, holder: "State program", confirmed: null, date: null, ref: { id: "note:3", quote: "lien of $9,400" } },
    ] }, { input_tokens: 1000, output_tokens: 100 }, { model: "claude-haiku-4-5" }));
    const cache = new MemoryCache();
    const log = vi.fn();
    const r1 = await extractFactsDetailed({ matter, records, cache, log });
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(r1.facts.liens).toHaveLength(1);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0].stage).toBe("extract_facts");

    const r2 = await extractFactsDetailed({ matter, records, cache, log });
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(r2.facts.liens).toHaveLength(1);
  });

  it("accepts ids echoed with brackets", async () => {
    createMock.mockResolvedValueOnce(sdkJson({ facts: [
      { kind: "lien", amount: 9400, perPerson: null, perAccident: null, coverageKind: null, carrier: null, holder: "State program", confirmed: null, exhausted: null, selfInsured: null, date: null, ref: { id: "[note:3]", quote: "lien of $9,400" } },
    ] }));
    const r = await extractFactsDetailed({ matter, records, cache: new MemoryCache(), log: () => {} });
    expect(r.facts.liens).toHaveLength(1);
    expect(r.warnings).toEqual([]);
  });

  it("warns and does not cache when a fact cites an unknown id", async () => {
    createMock.mockResolvedValue(sdkJson({ facts: [
      { kind: "lien", amount: 1, perPerson: null, perAccident: null, coverageKind: null, carrier: null, holder: "X", confirmed: null, exhausted: null, selfInsured: null, date: null, ref: { id: "note:404", quote: "$1" } },
    ] }));
    const cache = new MemoryCache();
    const r = await extractFactsDetailed({ matter, records, cache, log: () => {} });
    expect(r.warnings[0]).toMatch(/outside the batch/);
    await extractFactsDetailed({ matter, records, cache, log: () => {} });
    expect(createMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("degrades to empty facts with a warning when the model refuses twice", async () => {
    createMock.mockResolvedValue(sdkJson({}, {}, { stop_reason: "refusal" }));
    const r = await extractFactsDetailed({ matter, records, cache: new MemoryCache(), log: () => {} });
    expect(r.facts.coverage).toEqual([]);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});
