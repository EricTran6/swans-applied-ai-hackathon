import { describe, it, expect } from "vitest";
import type { AiCall, ShareCandidate } from "@/lib/types";
import { flagCandidates, keywordDowngrade, type FlagClient } from "./index";

const cand = (id: string, included: boolean, extra: Partial<ShareCandidate> = {}): ShareCandidate => ({
  id, category: "requests", label: `Item ${id}`, preview: "Send updated treatment records", included, hardDeny: false,
  providerContactId: "p1", flag: null, ...extra,
});
const mock = (text: string, usage = { input_tokens: 100, output_tokens: 20 }): FlagClient => ({
  messages: { create: async () => ({ content: [{ type: "text", text }], usage }) },
});

describe("flagCandidates (Haiku, enum output, downgrade only)", () => {
  it("block and review both lower inclusion; ok keeps it", async () => {
    const out = await flagCandidates([cand("a", true), cand("b", true), cand("c", true)], {
      client: mock('[{"id":"a","level":"block","reason":"mentions offer"},{"id":"b","level":"review","reason":"unsure"},{"id":"c","level":"ok","reason":""}]'),
    });
    expect(out.map((c) => [c.included, c.flag?.level])).toEqual([[false, "block"], [false, "review"], [true, "ok"]]);
  });
  it("can never raise inclusion: excluded or hard-deny items stay excluded whatever the model says", async () => {
    const input = [cand("x", false), cand("y", false, { hardDeny: true, category: "valuation" }), cand("z", true)];
    const out = await flagCandidates(input, { client: mock('[{"id":"x","level":"ok","reason":""},{"id":"y","level":"ok","reason":""},{"id":"z","level":"ok","reason":""},{"id":"ghost","level":"ok","reason":""}]') });
    expect(out.map((c) => c.included)).toEqual([false, false, true]);
    expect(out.length).toBe(3);
  });
  it("ignores unknown levels and ids", async () => {
    const out = await flagCandidates([cand("a", true)], { client: mock('[{"id":"a","level":"allow","reason":"x"}]') });
    expect(out[0].included).toBe(true);
  });
  it("falls back to the keyword downgrade on API error or garbage output", async () => {
    const items = [cand("a", true, { preview: "Discuss settlement offer" }), cand("b", true)];
    const failing: FlagClient = { messages: { create: async () => { throw new Error("boom"); } } };
    const out = await flagCandidates(items, { client: failing });
    expect(out[0]).toMatchObject({ included: false, flag: { level: "review" } });
    expect(out[1].included).toBe(true);
    const garbage = await flagCandidates(items, { client: mock("not json") });
    expect(garbage[0].included).toBe(false);
  });
  it("logs the call with model and tokens", async () => {
    const calls: AiCall[] = [];
    await flagCandidates([cand("a", true)], { client: mock("[]"), model: "claude-haiku-4-5", log: (c) => calls.push(c), matterId: "m" });
    expect(calls[0]).toMatchObject({ stage: "share_flags", model: "claude-haiku-4-5", inputTokens: 100, outputTokens: 20, matterId: "m" });
  });
  it("skips the API entirely when nothing is included", async () => {
    let called = 0;
    const client: FlagClient = { messages: { create: async () => { called++; return { content: [] }; } } };
    await flagCandidates([cand("a", false)], { client });
    expect(called).toBe(0);
  });
});

describe("keywordDowngrade", () => {
  it("flags internal vocabulary but not 'client' (contains 'lien') and leaves excluded items alone", () => {
    const out = keywordDowngrade([
      cand("a", true, { preview: "Client treatment on Friday" }),
      cand("b", true, { preview: "Lien reduction strategy" }),
      cand("c", true, { label: "IME report" }),
      cand("d", false, { preview: "demand package" }),
    ]);
    expect(out.map((c) => [c.included, c.flag?.level ?? null])).toEqual([[true, null], [false, "review"], [false, "review"], [false, null]]);
  });
});
