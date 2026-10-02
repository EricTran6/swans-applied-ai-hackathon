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

import { extractFactsDetailed, mergeFacts, selectFactRecords, type RawFact } from "./facts";

const noteOld = makeNote("1", "Insurance", "2024-03-20", "Carrier says liability limits are $100,000/$300,000 per the adjuster.");
const noteNew = makeNote("2", "Coverage", "2026-09-05", "Adjuster confirmed in writing: liability limits $250,000/$500,000.");
const noteLien = makeNote("3", "Lien", "2025-02-02", "State program asserted a lien of $9,400.");
const noteChat = makeNote("4", "Call", "2025-03-01", "Client called to ask about her next appointment.");
const cfValue = makeCustomField("cv", "Estimated Case Value", "$600,000", 600000);
const matter = makeMatter([cfValue]);
const records = [matter, cfValue, noteOld, noteNew, noteLien, noteChat];

const fact = (p: Partial<RawFact> & { ref: RawFact["ref"]; kind: RawFact["kind"] }): RawFact => ({
  amount: null, perPerson: null, perAccident: null, coverageKind: null, carrier: null, holder: null, confirmed: null, date: null, ...p,
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

  it("degrades to empty facts with a warning when the model refuses twice", async () => {
    createMock.mockResolvedValue(sdkJson({}, {}, { stop_reason: "refusal" }));
    const r = await extractFactsDetailed({ matter, records, cache: new MemoryCache(), log: () => {} });
    expect(r.facts.coverage).toEqual([]);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});
