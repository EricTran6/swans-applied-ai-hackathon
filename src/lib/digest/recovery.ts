// "Who gets paid": splits a settlement across fee, firm costs, liens, provider bills and the client.
// Pure, code-only arithmetic (no AI). Illustrative, not a distribution statement: lien priority and
// reductions vary by jurisdiction, so the attorney edits every assumption in the UI.
import type { SourceRef } from "@/lib/types";

/** Generic contingency-fee default; Clio has no fee field, so the UI marks it as an editable assumption. */
export const DEFAULT_FEE_PCT = 1 / 3;
/** "Rule of thirds" negotiating heuristic for the client's target share; editable in the UI. */
export const DEFAULT_CLIENT_TARGET_SHARE = 1 / 3;

export interface RecoveryLine { label: string; amount: number; refs: SourceRef[] }
export interface ProviderPayout { label: string; billed: number; paid: number; refs: SourceRef[] }
export interface Allocation { providers: ProviderPayout[]; providersPaid: number; client: number }
export interface RecoveryPlan {
  settlement: number; feePct: number; target: number;
  fee: number; costsPaid: number; liensPaid: number; liensPaidEach: number[];
  providersBilled: number;
  shortfall: number;            // total owed (fee + costs + liens + bills) minus settlement, never below 0
  reductionPct: number | null;  // uniform provider reduction so the client nets >= target; null = unreachable
  asBilled: Allocation;         // providers paid pro rata up to their full bills
  negotiated: Allocation;       // providers paid after the uniform reduction
}
export interface RecoveryInput {
  settlement: number; feePct: number; target: number;
  costs: RecoveryLine | null; liens: readonly RecoveryLine[]; providers: readonly RecoveryLine[];
}

const cents = (n: number) => Math.round(n * 100) / 100;
const nonNeg = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

/** Pays fee, then costs and liens in full (as far as money allows), then providers pro rata. */
export function recoveryPlan(input: RecoveryInput): RecoveryPlan {
  const settlement = nonNeg(input.settlement);
  const feePct = Math.min(1, nonNeg(input.feePct));
  const target = nonNeg(input.target);
  const fee = cents(settlement * feePct);

  let left = settlement - fee;
  const take = (amount: number) => { const paid = Math.min(nonNeg(amount), left); left -= paid; return cents(paid); };
  const costsPaid = take(input.costs?.amount ?? 0);
  const liensPaidEach = input.liens.map((l) => take(l.amount));
  const liensPaid = cents(liensPaidEach.reduce((s, x) => s + x, 0));
  const remainder = cents(Math.max(0, left));

  const providersBilled = cents(input.providers.reduce((s, p) => s + nonNeg(p.amount), 0));
  const owed = fee + nonNeg(input.costs?.amount ?? 0) + input.liens.reduce((s, l) => s + nonNeg(l.amount), 0) + providersBilled;
  const shortfall = cents(Math.max(0, owed - settlement));

  const forProviders = remainder - target;
  const reductionPct = forProviders < 0 ? null
    : providersBilled === 0 || forProviders >= providersBilled ? 0
    : 1 - forProviders / providersBilled;

  return {
    settlement, feePct, target, fee, costsPaid, liensPaid, liensPaidEach, providersBilled, shortfall, reductionPct,
    asBilled: allocate(input.providers, Math.min(remainder, providersBilled), remainder),
    negotiated: allocate(input.providers, reductionPct == null ? 0 : providersBilled * (1 - reductionPct), remainder),
  };
}

/** Splits `pot` across providers in proportion to their bills; the client keeps what is left of `remainder`. */
function allocate(providers: readonly RecoveryLine[], pot: number, remainder: number): Allocation {
  const billed = providers.reduce((s, p) => s + nonNeg(p.amount), 0);
  const list = providers.map((p) => ({
    label: p.label, billed: nonNeg(p.amount), refs: p.refs,
    paid: billed > 0 ? cents((nonNeg(p.amount) / billed) * pot) : 0,
  }));
  const providersPaid = cents(list.reduce((s, p) => s + p.paid, 0));
  return { providers: list, providersPaid, client: cents(Math.max(0, remainder - providersPaid)) };
}
