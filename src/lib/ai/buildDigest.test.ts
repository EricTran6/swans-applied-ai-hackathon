import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeInputSetHash, makeCustomField, makeDoc, makeDocText, makeMatter, makeNote, MemoryCache, sdkJson } from "./__tests__/helpers";
import type { AiCall, Digest } from "@/lib/types";

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

import { buildDigest, markUnextracted } from "./index";

const cf = makeCustomField("pl", "Policy Limits", "Liability $250,000/$500,000");
const matter = makeMatter([cf]);
const n1 = makeNote("1", "Intake", "2024-03-15", "Rear-ended at a light. Treating twice weekly.");
const n2 = makeNote("2", "Coverage", "2026-09-05", "Adjuster confirmed limits $250,000/$500,000.");
const doc = makeDoc("55", "02-pleadings__bill-of-particulars-sample.pdf", "02 Pleadings", 2);
const records = [matter, cf, n1, n2, doc];
const docTexts = [makeDocText("55", ["cover", "Plaintiff sustained a cervical strain."])];
const now = new Date("2026-10-02T12:00:00Z");

function respond() {
  createMock.mockImplementation(async (req: { system: string }) => {
    if (req.system.includes("extract insurance")) {
      return sdkJson({ facts: [{ kind: "coverage", amount: null, perPerson: 250000, perAccident: 500000, coverageKind: "BI", carrier: null, holder: null, confirmed: null, date: null, ref: { id: "note:2", quote: "$250,000/$500,000" } }] },
        { input_tokens: 1000, output_tokens: 100 }, { model: "claude-haiku-4-5" });
    }
    if (req.system.includes("[[PAGE n]]")) {
      return sdkJson({ injuries: [{ name: "Cervical strain", bodyPart: "neck", status: "diagnosed", firstDocumented: null, refs: [{ page: 2, quote: "cervical strain" }] }] },
        { input_tokens: 2000, output_tokens: 200 }, { model: "claude-sonnet-5-5" });
    }
    return sdkJson({
      brief: [{ text: "Rear-end collision; client treating.", refs: [{ id: "note:1", quote: "Rear-ended at a light" }] }],
      whys: [{ id: "note:1", why: "Origin of the claim." }, { id: "note:2", why: "Limits now confirmed." }],
      openQuestions: [], statusChips: [{ text: "Treating twice weekly", refs: [{ id: "note:1", quote: "Treating twice weekly" }] }],
    }, { input_tokens: 10000, output_tokens: 500, cache_read_input_tokens: 0 }, { model: "claude-sonnet-5-5" });
  });
}

describe("buildDigest", () => {
  beforeEach(() => { createMock.mockReset(); });

  it("runs facts -> deterministic -> injuries + synthesis, fills whys and sums cost", async () => {
    respond();
    const calls: AiCall[] = [];
    const d = await buildDigest({ matter, records, docTexts, changeFeed: [], prev: null, cache: new MemoryCache(), log: (c) => calls.push(c), now });
    expect(createMock).toHaveBeenCalledTimes(3);
    expect(d.coverage[0]).toMatchObject({ kind: "BI", perPerson: 250000 });
    expect(d.injuries.map((x) => x.name)).toEqual(["Cervical strain"]);
    expect(d.brief).toHaveLength(1);
    expect(d.topTen.find((t) => t.ref.drawerKey === "note:2")?.why).toBe("Limits now confirmed.");
    expect(d.client.statusChips[0].text).toBe("Treating twice weekly");
    expect(d.inputSetHash).toBe(fakeInputSetHash(records));
    expect(d.createdAt).toBe(now.toISOString());
    const expected = (1000 * 1 + 100 * 5) / 1e6 + (2000 * 2 + 200 * 10) / 1e6 + (10000 * 2 + 500 * 10) / 1e6;
    expect(d.meta.costUsd).toBeCloseTo(expected, 6);
    expect(calls.reduce((s, c) => s + c.usd, 0)).toBeCloseTo(expected, 6);
    expect(d.meta.models.extract).toBe("claude-haiku-4-5");
    expect(d.meta.cached).toBeUndefined();
    expect(d.meta.builtAt).toBe(now.toISOString());
  });

  it("makes zero SDK calls and returns prev with meta.cached when the input hash is unchanged", async () => {
    respond();
    const prev = { version: 3, ...(await buildDigest({ matter, records, docTexts, changeFeed: [], prev: null, cache: new MemoryCache(), log: () => {}, now })) } as Digest;
    createMock.mockReset();
    const log = vi.fn();
    const again = await buildDigest({ matter, records, docTexts, changeFeed: [], prev, cache: new MemoryCache(), log, now: new Date() });
    expect(createMock).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(again.meta.cached).toBe(true);
    expect(again.brief).toEqual(prev.brief);
    expect("version" in again).toBe(false);
  });

  it("rebuilds when the previous digest degraded on an API error, even with the same inputs", async () => {
    respond();
    const ok = await buildDigest({ matter, records, docTexts, changeFeed: [], prev: null, cache: new MemoryCache(), log: () => {}, now });
    const prev = { version: 1, ...ok, meta: { ...ok.meta, warnings: ["synthesize: API error (boom)"] } } as Digest;
    createMock.mockClear();
    const again = await buildDigest({ matter, records, docTexts, changeFeed: [], prev, cache: new MemoryCache(), log: () => {}, now });
    expect(again.meta.cached).toBeUndefined();
    expect(createMock).toHaveBeenCalled();
  });

  it("labels empty fact KPIs as not extracted (not 'not in Clio') when fact extraction errored", () => {
    const kpis = [
      { key: "coverage", label: "Coverage", display: "Not recorded in Clio", value: null, unit: "usd", status: "unknown", refs: [], asOf: "x", computedBy: "code" },
      { key: "firm_spend", label: "Firm spend", display: "$1", value: 1, unit: "usd", status: "ok", refs: [], asOf: "x", computedBy: "code" },
    ] as Digest["kpis"];
    const out = markUnextracted(kpis);
    expect(out[0].display).toBe("Not extracted (AI error)");
    expect(out[1]).toBe(kpis[1]);
  });

  it("rebuilds when the previous digest came from a different pipeline version", async () => {
    respond();
    const ok = await buildDigest({ matter, records, docTexts, changeFeed: [], prev: null, cache: new MemoryCache(), log: () => {}, now });
    const prev = { version: 1, ...ok, meta: { ...ok.meta, models: { ...ok.meta.models, pipeline: "old" } } } as Digest;
    createMock.mockClear();
    const again = await buildDigest({ matter, records, docTexts, changeFeed: [], prev, cache: new MemoryCache(), log: () => {}, now });
    expect(again.meta.cached).toBeUndefined();
  });

  it("rebuilds when a record changed, re-using the per-record extraction cache", async () => {
    respond();
    const cache = new MemoryCache();
    const first = await buildDigest({ matter, records, docTexts, changeFeed: [], prev: null, cache, log: () => {}, now });
    const prev = { version: 1, ...first } as Digest;
    const changed = [...records, makeNote("3", "Call", "2026-10-01", "Client called about PT.")];
    createMock.mockClear();
    const d = await buildDigest({ matter, records: changed, docTexts, changeFeed: [], prev, cache, log: () => {}, now });
    expect(d.meta.cached).toBeUndefined();
    // facts cached per record (new note has no money words), injuries cached by doc version -> only synthesis runs
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0][0].system).toContain("brief a personal-injury attorney");
  });
});
