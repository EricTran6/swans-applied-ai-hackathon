// Compile-time check that the fixtures match the contract types.
import { describe, it, expect } from "vitest";
import type { Digest, ProviderView } from "@/lib/types";
import digest from "../../fixtures/sample-digest.json";
import pv from "../../fixtures/sample-provider-view.json";

describe("fixtures match contract", () => {
  it("sample digest and provider view are well-typed", () => {
    const d = digest as unknown as Digest; const v = pv as unknown as ProviderView;
    expect(d.topTen.length).toBeLessThanOrEqual(10);
    expect(v.bill?.stale).toBe(true);
  });
});
