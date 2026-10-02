// Money KPIs, coverage cap, value waterfall and provider bills. All arithmetic lives here; the AI only
// supplies extracted numbers with verified refs (ExtractedFacts).
import type {
  ClioRecord, CoverageLayer, CustomFieldValue, Expense, ExtractedFacts, Kpi, Matter, ProviderBill, SourceRef,
  WaterfallStep,
} from "@/lib/types";
import { byType, dayKey, metaRef, usd } from "./util";

const CAP_KINDS: CoverageLayer["kind"][] = ["BI", "UM/UIM", "Umbrella"];

export function findCustomField(matter: Matter, records: ClioRecord[], re: RegExp, types?: RegExp):
  CustomFieldValue | null {
  const all = [...matter.customFields, ...byType(records, "custom_field")];
  return all.find((f) => re.test(f.name) && (!types || types.test(f.fieldType)) && f.value != null && f.value !== "")
    ?? null;
}
const num = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") { const n = Number(v.replace(/[$,\s]/g, "")); return Number.isFinite(n) && v.trim() ? n : null; }
  return null;
};

/** Effective liability coverage: BI + UM/UIM only above BI (excess) + umbrella; exhausted layers excluded. */
export function coverageCap(layers: CoverageLayer[]): { cap: number | null; refs: SourceRef[] } {
  const live = layers.filter((l) => !l.exhausted && CAP_KINDS.includes(l.kind) && l.perPerson != null);
  if (!live.length) return { cap: null, refs: [] };
  const sum = (k: CoverageLayer["kind"]) => live.filter((l) => l.kind === k).reduce((s, l) => s + (l.perPerson ?? 0), 0);
  const bi = sum("BI");
  const cap = bi + Math.max(0, sum("UM/UIM") - bi) + sum("Umbrella");
  return { cap, refs: live.flatMap((l) => l.refs) };
}
const biLimit = (layers: CoverageLayer[]) =>
  layers.find((l) => l.kind === "BI" && !l.exhausted && l.perPerson != null)?.perPerson ?? null;

export const firmExpenses = (records: ClioRecord[]) => byType(records, "expense").filter((e) => e.kind === "firm");
export const providerBillRows = (records: ClioRecord[]) =>
  byType(records, "expense").filter((e) => e.kind === "provider_bill");

export function providerBills(records: ClioRecord[]): ProviderBill[] {
  const contacts = new Map(byType(records, "contact").map((c) => [c.clioId, c]));
  const groups = new Map<string, Expense[]>();
  for (const e of providerBillRows(records)) {
    const k = e.providerContactId ?? `unmatched:${e.billFilename ?? e.clioId}`;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  return [...groups.values()].map((rows) => {
    const id = rows[0].providerContactId;
    const through = rows.map((r) => /services\s+through\s+(\d{4}-\d{2}-\d{2})/i.exec(r.bodyText || r.description)?.[1])
      .filter((x): x is string => !!x).sort();
    return {
      providerContactId: id,
      providerName: (id && contacts.get(id)?.name) || rows[0].billFilename || "Unmatched provider",
      amount: rows.reduce((s, r) => s + r.amount, 0),
      servicesThrough: through.at(-1) ?? null,
      refs: rows.map((r) => metaRef(r, usd(r.amount))),
    };
  }).sort((a, b) => b.amount - a.amount);
}

export function valueWaterfall(facts: ExtractedFacts | null, records: ClioRecord[]): WaterfallStep[] {
  const { cap, refs } = coverageCap(facts?.coverage ?? []);
  if (cap == null) return [];
  const steps: WaterfallStep[] = [{ label: "Coverage cap", amount: cap, kind: "start", refs }];
  for (const l of facts?.liens ?? []) {
    if (l.amount == null) continue;
    steps.push({ label: `${l.holder} lien`, amount: -l.amount, kind: "minus", refs: [l.ref] });
  }
  const firm = firmExpenses(records);
  const spend = firm.reduce((s, e) => s + e.amount, 0);
  if (spend) steps.push({ label: "Firm costs", amount: -spend, kind: "minus", refs: firm.map((e) => metaRef(e, usd(e.amount))) });
  steps.push({ label: "Before attorney fees", amount: steps.reduce((s, x) => s + x.amount, 0), kind: "result", refs: [] });
  return steps;
}

export function moneyKpis(matter: Matter, records: ClioRecord[], facts: ExtractedFacts | null, asOf: string): Kpi[] {
  const base = { asOf, computedBy: "code" as const };
  const layers = facts?.coverage ?? [];
  const conflictsFor = (f: string) => (facts?.conflicts ?? []).filter((c) => c.field === f).flatMap((c) => c.refs);

  // Case value: attorney custom field > extracted fact > not recorded.
  const cvField = findCustomField(matter, records, /case\s*value/i, /currency|numeric|number/i);
  const cvNum = cvField ? num(cvField.value) : null;
  const cv = cvField && cvNum != null ? { amount: cvNum, ref: metaRef(cvField, usd(cvNum)) } : facts?.caseValue ?? null;
  const biCap = biLimit(layers);
  const cvConf = conflictsFor("case_value");
  const caseValue: Kpi = cv
    ? { ...base, key: "case_value", label: "Case value", value: cv.amount, unit: "usd",
      display: biCap != null && cv.amount > biCap ? `${usd(cv.amount)} est. · capped at ${usd(biCap)}` : `${usd(cv.amount)} est.`,
      range: { low: biCap != null ? Math.min(cv.amount, biCap) : cv.amount, high: cv.amount, cap: biCap },
      status: biCap != null && cv.amount > biCap ? "warn" : "ok",
      refs: [cv.ref, ...(layers.find((l) => l.kind === "BI")?.refs ?? [])], ...(cvConf.length ? { conflicts: cvConf } : {}) }
    : { ...base, key: "case_value", label: "Case value", display: "Not recorded in Clio", value: null, unit: "usd",
      status: "unknown", refs: [] };

  const { cap, refs: capRefs } = coverageCap(layers);
  const covConf = conflictsFor("coverage");
  const confirmed = facts?.coverageConfirmed?.confirmed === true;
  const coverage: Kpi = cap != null
    ? { ...base, key: "coverage", label: "Coverage", value: cap, unit: "usd",
      display: `${usd(cap)} cap · ${confirmed ? "confirmed" : "unconfirmed"}`,
      // Older conflicting sources are superseded by a later written confirmation.
      status: confirmed && covConf.every((c) => (dayKey(c.sourceDate) ?? "") <= (dayKey(facts?.coverageConfirmed?.on ?? null) ?? "")) ? "ok" : "warn",
      refs: [...capRefs, ...(facts?.coverageConfirmed ? [facts.coverageConfirmed.ref] : [])],
      ...(covConf.length ? { conflicts: covConf, note: "Older sources disagree; latest-dated source wins" } : {}) }
    : { ...base, key: "coverage", label: "Coverage", display: "Not recorded in Clio", value: null, unit: "usd",
      status: "unknown", refs: [], ...(covConf.length ? { conflicts: covConf } : {}) };

  const firm = firmExpenses(records);
  const spend = firm.reduce((s, e) => s + e.amount, 0);
  const firmSpend: Kpi = { ...base, key: "firm_spend", label: "Firm spend", display: usd(spend), value: spend,
    unit: "usd", status: "ok", refs: firm.map((e) => metaRef(e, usd(e.amount))) };

  const bills = providerBillRows(records);
  const total = bills.reduce((s, e) => s + e.amount, 0);
  const spField = findCustomField(matter, records, /specials/i);
  const spNum = spField ? num(spField.value) : null;
  const mismatch = spNum != null && Math.abs(spNum - total) >= 0.5;
  const spConf = conflictsFor("specials");
  const specials: Kpi = bills.length || spNum != null
    ? { ...base, key: "specials", label: "Medical specials", display: usd(total), value: total, unit: "usd",
      status: mismatch || spConf.length ? "warn" : "ok",
      refs: bills.map((e) => metaRef(e, usd(e.amount))),
      ...(mismatch ? { note: `Bills sum to ${usd(total)} but ${spField!.name} says ${usd(spNum!)}`,
        conflicts: [metaRef(spField!, usd(spNum!)), ...spConf] } : spConf.length ? { conflicts: spConf } : {}) }
    : { ...base, key: "specials", label: "Medical specials", display: "Not recorded in Clio", value: null, unit: "usd",
      status: "unknown", refs: [] };

  return [caseValue, coverage, firmSpend, specials];
}

export const asOfKey = (now: Date) => dayKey(now.toISOString())!;
