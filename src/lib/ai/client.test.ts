import { describe, it, expect, vi, beforeEach } from "vitest";
import { sdkJson } from "./__tests__/helpers";

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error { status?: number }
  class Anthropic { messages = { create: createMock }; static APIError = APIError }
  return { default: Anthropic };
});

import { callJson, priceUsd } from "./client";
import type { AiCall } from "@/lib/types";

describe("priceUsd", () => {
  it("uses the per-model price table", () => {
    expect(priceUsd("claude-haiku-4-5", 1_000_000, 0, 0)).toBeCloseTo(1);
    expect(priceUsd("claude-sonnet-5-5", 1_000_000, 1_000_000, 0)).toBeCloseTo(12);
    expect(priceUsd("claude-sonnet-5-5", 0, 0, 1_000_000)).toBeCloseTo(0.2);
  });
});

describe("callJson", () => {
  beforeEach(() => { createMock.mockReset(); });

  it("parses structured output and logs cost from usage", async () => {
    createMock.mockResolvedValueOnce(sdkJson({ ok: true }, { input_tokens: 2000, output_tokens: 500 }, { model: "claude-haiku-4-5" }));
    const calls: AiCall[] = [];
    const r = await callJson<{ ok: boolean }>({ stage: "t", model: "claude-haiku-4-5", system: "s", user: "u", schema: { type: "object" }, matterId: "m1", log: (c) => calls.push(c) });
    expect(r.data).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].usd).toBeCloseTo((2000 * 1 + 500 * 5) / 1e6);
    const req = createMock.mock.calls[0][0];
    expect(req.output_config.format.type).toBe("json_schema");
    expect(req.tool_choice).toBeUndefined();
    expect(req.temperature).toBeUndefined();
  });

  it("retries once on refusal, then degrades with a warning", async () => {
    createMock.mockResolvedValueOnce(sdkJson({}, {}, { stop_reason: "refusal" }));
    createMock.mockResolvedValueOnce(sdkJson({}, {}, { stop_reason: "refusal" }));
    const calls: AiCall[] = [];
    const r = await callJson({ stage: "t", model: "m", system: "s", user: "u", schema: {}, matterId: null, log: (c) => calls.push(c) });
    expect(createMock).toHaveBeenCalledTimes(2);
    expect(r.data).toBeNull();
    expect(r.warning).toMatch(/refused/);
    expect(calls).toHaveLength(2); // both attempts cost money and are logged
  });
});
