import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMatter, makeNote, sdkJson } from "./__tests__/helpers";

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

import { buildSynthesisPrompt, findPostureNote, synthesizeDetailed } from "./synthesize";

const matter = makeMatter();
const n1 = makeNote("1", "Intake summary", "2024-03-15", "Rear-ended at a light. Treating twice weekly.");
const n2 = makeNote("2", "Case posture", "2026-09-20", "Read before the conference. Causation disputed. Still out of work.");
const n3 = makeNote("3", "Post-op", "2024-06-10", "Arthroscopy performed; recovery on track.");
const records = [matter, n1, n2, n3];

describe("prompt", () => {
  it("feeds the latest posture-like note verbatim and lists the top ids", () => {
    expect(findPostureNote(records)?.clioId).toBe("2");
    const p = buildSynthesisPrompt({ matter, records, topIds: ["note:3", "note:1"] });
    expect(p).toContain("POSTURE NOTE (verbatim)");
    expect(p).toContain("Read before the conference.");
    expect(p.indexOf("[note:3]")).toBeLessThan(p.indexOf("RECORDS"));
  });
});

describe("synthesizeDetailed", () => {
  beforeEach(() => { createMock.mockReset(); });

  it("validates every claim ref, drops hallucinated ids, maps whys to top ids", async () => {
    createMock.mockResolvedValueOnce(sdkJson({
      brief: [
        { text: "Client was rear-ended and is treating.", refs: [{ id: "note:1", quote: "Rear-ended at a light" }, { id: "note:1", quote: "Treating twice weekly" }] },
        { text: "Made-up claim.", refs: [{ id: "note:404", quote: "whatever" }] },
      ],
      whys: [{ id: "note:3", why: "Surgery done; drives value." }, { id: "note:77", why: "not in top ten" }],
      openQuestions: [{ text: "Is causation resolved?", refs: [{ id: "note:2", quote: "Causation disputed" }, { id: "note:3", quote: "recovery on track" }] }],
      statusChips: [{ text: "Out of work", refs: [{ id: "note:2", quote: "Still out of work" }] }],
    }, { input_tokens: 5000, output_tokens: 400 }, { model: "claude-sonnet-5-5" }));
    const r = await synthesizeDetailed({ matter, records, topIds: ["note:3", "note:1"], log: () => {} });
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(r.output.brief.map((c) => c.text)).toEqual(["Client was rear-ended and is treating."]);
    expect(r.output.brief[0].refs[0].quoteVerified).toBe(true);
    expect(r.droppedRefs).toBe(1);
    expect(r.droppedClaims).toBe(1);
    expect(r.output.whys).toEqual({ "note:3": "Surgery done; drives value." });
    expect(r.output.statusChips[0].text).toBe("Out of work");
  });

  it("retries once listing bad ids when more than 20% of refs are dropped", async () => {
    createMock
      .mockResolvedValueOnce(sdkJson({ brief: [{ text: "a", refs: [{ id: "note:9", quote: "x" }] }, { text: "b", refs: [{ id: "note:8", quote: "x" }] }], whys: [], openQuestions: [], statusChips: [] }))
      .mockResolvedValueOnce(sdkJson({ brief: [{ text: "ok", refs: [{ id: "note:1", quote: "Treating twice weekly" }] }], whys: [], openQuestions: [], statusChips: [] }));
    const r = await synthesizeDetailed({ matter, records, topIds: [], log: () => {} });
    expect(createMock).toHaveBeenCalledTimes(2);
    expect(createMock.mock.calls[1][0].messages[0].content).toContain("note:9");
    expect(r.output.brief).toHaveLength(1);
    expect(r.droppedRefs).toBe(0);
  });
});
