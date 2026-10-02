import { describe, expect, it } from "vitest";
import { recoveryPlan, type RecoveryLine } from "@/lib/digest/recovery";

const line = (label: string, amount: number): RecoveryLine => ({ label, amount, refs: [] });
const base = {
  feePct: 1 / 3,
  costs: line("Firm costs", 1_000),
  liens: [line("State lien", 9_000)],
  providers: [line("Provider A", 40_000), line("Provider B", 20_000)],
};

describe("recoveryPlan", () => {
  it("pays fee, costs and liens first, then providers pro rata, client keeps the rest", () => {
    const p = recoveryPlan({ ...base, feePct: 0.25, settlement: 300_000, target: 100_000 });
    expect(p.fee).toBe(75_000);
    expect(p.costsPaid).toBe(1_000);
    expect(p.liensPaid).toBe(9_000);
    expect(p.asBilled.providers.map((x) => x.paid)).toEqual([40_000, 20_000]);
    expect(p.asBilled.client).toBe(155_000);
    expect(p.shortfall).toBe(0);
    expect(p.reductionPct).toBe(0);
  });

  it("reports the shortfall and the uniform provider reduction that reaches the client target", () => {
    const p = recoveryPlan({ ...base, settlement: 90_000, target: 30_000 });
    expect(p.fee).toBe(30_000);
    expect(p.shortfall).toBe(10_000);
    // As billed: the 50k left after fee/costs/liens all goes to providers, pro rata.
    expect(p.asBilled.providers.map((x) => x.paid)).toEqual([33_333.33, 16_666.67]);
    expect(p.asBilled.client).toBe(0);
    // Providers must take 2/3 off so 20k goes to them and 30k to the client.
    expect(p.reductionPct).toBeCloseTo(2 / 3, 6);
    expect(p.negotiated.providers.map((x) => x.paid)).toEqual([13_333.33, 6_666.67]);
    expect(p.negotiated.client).toBe(30_000);
  });

  it("flags an unreachable target and gives the client the most possible", () => {
    const p = recoveryPlan({ ...base, settlement: 30_000, target: 15_000 });
    expect(p.reductionPct).toBeNull();
    expect(p.negotiated.providers.every((x) => x.paid === 0)).toBe(true);
    expect(p.negotiated.client).toBe(10_000);
  });

  it("caps costs and liens at what is left after the fee", () => {
    const p = recoveryPlan({ ...base, settlement: 12_000, target: 0 });
    expect(p.fee).toBe(4_000);
    expect(p.costsPaid).toBe(1_000);
    expect(p.liensPaid).toBe(7_000);
    expect(p.asBilled.client).toBe(0);
  });

  it("handles a zero settlement and no providers", () => {
    const p = recoveryPlan({ ...base, providers: [], settlement: 0, target: 0 });
    expect([p.fee, p.costsPaid, p.liensPaid, p.asBilled.client]).toEqual([0, 0, 0, 0]);
    expect(p.reductionPct).toBe(0);
  });

  it("sanitizes bad numbers instead of throwing", () => {
    const p = recoveryPlan({ ...base, settlement: Number.NaN, feePct: 4, target: -5 });
    expect(p.settlement).toBe(0);
    expect(p.feePct).toBe(1);
    expect(p.target).toBe(0);
  });

  it("does not mutate its inputs", () => {
    const providers = Object.freeze([Object.freeze(line("Provider A", 40_000))]);
    expect(() => recoveryPlan({ ...base, providers, settlement: 90_000, target: 30_000 })).not.toThrow();
  });
});
