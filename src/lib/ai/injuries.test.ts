import { describe, it, expect, vi, beforeEach } from "vitest";
import { fixtureDocuments, makeDoc, makeDocText, MemoryCache, sdkJson } from "./__tests__/helpers";

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

import { chooseInjuryDocuments, extractInjuriesDetailed, pageChunks } from "./injuries";

describe("chooseInjuryDocuments", () => {
  it("picks the pleading from the fixture documents by generic pattern", () => {
    const docs = fixtureDocuments();
    const expected = docs.find((d) => /particulars/i.test(d.name))!;
    const { chosen, needsClassification } = chooseInjuryDocuments(docs);
    expect(needsClassification).toBe(false);
    expect(chosen.map((d) => d.clioId)).toEqual([expected.clioId]);
  });

  it("prefers a bill of particulars over other pleadings and skips docs without a text layer", () => {
    const bop = makeDoc("1", "02-pleadings__bill-of-particulars.pdf", "02 Pleadings", 14, "2024-01-01");
    const answer = makeDoc("2", "02-pleadings__verified-answer.pdf", "02 Pleadings", 27, "2024-02-01");
    const complaint = makeDoc("3", "02-pleadings__summons-complaint.pdf", "02 Pleadings", 8, "2024-03-01");
    expect(chooseInjuryDocuments([answer, complaint, bop]).chosen.map((d) => d.clioId)).toEqual(["1"]);
    const scanned = { ...bop, textLayer: false };
    expect(chooseInjuryDocuments([answer, scanned]).chosen.map((d) => d.clioId)).toEqual(["2"]);
  });

  it("falls back to medical records, then to classification", () => {
    const med = makeDoc("9", "ortho-consult.pdf", "04 Medical Records", 3);
    const other = makeDoc("8", "retainer.pdf", "01 Intake", 2);
    expect(chooseInjuryDocuments([other, med]).chosen.map((d) => d.clioId)).toEqual(["9"]);
    expect(chooseInjuryDocuments([other])).toEqual({ chosen: [], needsClassification: true });
  });
});

describe("pageChunks", () => {
  it("marks absolute page numbers and chunks at 25 pages", () => {
    const pages = Array.from({ length: 30 }, (_, i) => `p${i + 1}`);
    const chunks = pageChunks(makeDocText("d", pages));
    expect(chunks).toHaveLength(2);
    expect(chunks[1].first).toBe(26);
    expect(chunks[1].body.startsWith("[[PAGE 26]]")).toBe(true);
  });
});

describe("extractInjuriesDetailed", () => {
  beforeEach(() => { createMock.mockReset(); });

  it("keeps injuries with a verified page ref, drops out-of-range pages, and caches by version", async () => {
    const doc = makeDoc("55", "02-pleadings__sample.pdf", "02 Pleadings", 3);
    const docTexts = [makeDocText("55", ["cover", "Plaintiff sustained a left shoulder labral tear requiring arthroscopy.", "Right knee meniscus tear; surgery recommended."])];
    createMock.mockResolvedValueOnce(sdkJson({ injuries: [
      { name: "Left shoulder labral tear", bodyPart: "left shoulder", status: "surgery-done", firstDocumented: null, refs: [{ page: 2, quote: "left shoulder labral tear" }] },
      { name: "Right knee meniscus tear", bodyPart: "right knee", status: "surgery-recommended", firstDocumented: null, refs: [{ page: 3, quote: "meniscus tear" }, { page: 9, quote: "nope" }] },
      { name: "Ghost injury", bodyPart: null, status: "diagnosed", firstDocumented: null, refs: [{ page: 7, quote: "x" }] },
    ] }, { input_tokens: 3000, output_tokens: 300 }, { model: "claude-sonnet-5-5" }));
    const cache = new MemoryCache();
    const log = vi.fn();
    const r = await extractInjuriesDetailed({ records: [doc], docTexts, cache, log });
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0][0].messages[0].content).toContain("[[PAGE 2]]");
    expect(r.injuries.map((x) => x.name)).toEqual(["Left shoulder labral tear", "Right knee meniscus tear"]);
    expect(r.injuries[1].refs).toHaveLength(1);
    expect(r.injuries[1].refs[0]).toMatchObject({ page: 3, drawerKey: "document:55#p3", quoteVerified: false });
    expect(r.droppedRefs).toBe(2);
    expect(r.documents).toEqual(["document:55"]);

    const r2 = await extractInjuriesDetailed({ records: [doc], docTexts, cache, log });
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(r2.injuries).toHaveLength(2);
  });

  it("skips page chunks with no text and de-duplicates refs to the same page", async () => {
    const doc = makeDoc("56", "02-pleadings__bill-of-particulars.pdf", "02 Pleadings", 26);
    const pages = [...Array.from({ length: 25 }, () => ""), "LEFT SHOULDER TEAR"];
    createMock.mockResolvedValueOnce(sdkJson({ injuries: [
      { name: "Left shoulder tear", bodyPart: "Left shoulder", status: "diagnosed", firstDocumented: null,
        refs: [{ page: 26, quote: "LEFT SHOULDER TEAR" }, { page: 26, quote: "SHOULDER TEAR" }] },
    ] }));
    const r = await extractInjuriesDetailed({ records: [doc], docTexts: [makeDocText("56", pages)], cache: new MemoryCache(), log: () => {} });
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0][0].messages[0].content).toContain("[[PAGE 26]]");
    expect(r.injuries[0].refs.map((x) => x.page)).toEqual([26]);
  });

  it("classifies first pages with Haiku when no name matches", async () => {
    const a = makeDoc("1", "scan-001.pdf", null, 2, "2024-01-01");
    const b = makeDoc("2", "scan-002.pdf", null, 2, "2024-02-01");
    const docTexts = [makeDocText("1", ["retainer agreement", ""]), makeDocText("2", ["Diagnosis: cervical strain", ""])];
    // Classification runs newest-first: doc 2, then doc 1; only doc 2 is relevant.
    createMock
      .mockResolvedValueOnce(sdkJson({ describesInjuries: true }))             // doc 2
      .mockResolvedValueOnce(sdkJson({ describesInjuries: false }))            // doc 1
      .mockResolvedValueOnce(sdkJson({ injuries: [{ name: "Cervical strain", bodyPart: "neck", status: "diagnosed", firstDocumented: null, refs: [{ page: 1, quote: "cervical strain" }] }] }));
    const r = await extractInjuriesDetailed({ records: [a, b], docTexts, cache: new MemoryCache(), log: () => {} });
    expect(createMock).toHaveBeenCalledTimes(3);
    expect(r.documents).toEqual(["document:2"]);
    expect(r.injuries[0].refs[0].clioId).toBe("2");
  });
});
