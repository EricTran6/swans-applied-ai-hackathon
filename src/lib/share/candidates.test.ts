import { describe, it, expect } from "vitest";
import type { CustomFieldValue, Expense, ShareCategory, SharePreset } from "@/lib/types";
import { buildCandidates, DEFAULT_PRESET, HARD_DENY, ID_COVERAGE_LIMITS, ID_OWN_BILL, isHardDeny, inScope } from "./index";
import { fixtureDigest, fixtureProviders, fixtureRecords } from "./__tests__/fixture-records";

const d = fixtureDigest();
const records = fixtureRecords();
const provs = fixtureProviders(records);
const rid = d.providerBills.find((b) => b.servicesThrough)!.providerContactId!;

describe("buildCandidates", () => {
  const cands = buildCandidates(d, records, rid, DEFAULT_PRESET);

  it("hard-denies valuation, settlement, attorney notes and internal comms with no toggle", () => {
    for (const c of cands) {
      if ((HARD_DENY as readonly string[]).includes(c.category)) { expect(c.hardDeny).toBe(true); expect(c.included).toBe(false); }
    }
    expect(cands.find((c) => c.id === "kpi:case_value")?.hardDeny).toBe(true);
    expect(cands.find((c) => c.id === "kpi:specials")?.hardDeny).toBe(true);
    expect(cands.find((c) => c.id === "digest:brief")?.hardDeny).toBe(true);
  });
  it("every note is attorney_notes and its preview never carries note body text", () => {
    const notes = cands.filter((c) => c.id.startsWith("note:"));
    expect(notes.length).toBe(records.filter((r) => r.sourceType === "note").length);
    for (const n of notes) { expect(n.category).toBe("attorney_notes"); expect(n.preview).not.toMatch(/\$|lien|value/i); }
  });
  it("includes status, stage, coverage, own bill, own records, own requests by default; limits toggle off", () => {
    const inc = cands.filter((c) => c.included).map((c) => c.id);
    expect(inc).toEqual(expect.arrayContaining(["status:alive", "status:stage", "kpi:coverage", ID_OWN_BILL]));
    expect(inc).not.toContain(ID_COVERAGE_LIMITS);
    expect(cands.find((c) => c.id === ID_COVERAGE_LIMITS)?.hardDeny).toBe(false);
    expect(cands.filter((c) => c.included && c.category === "own_records").length).toBeGreaterThan(0);
    expect(cands.filter((c) => c.included && c.category === "requests").every((c) => c.providerContactId === rid)).toBe(true);
  });
  it("other providers' bills are hard-denied; other records opt-in; care team opt-in", () => {
    const otherBills = cands.filter((c) => c.id.startsWith("bill:") && c.id !== ID_OWN_BILL);
    expect(otherBills.length).toBe(d.providerBills.length - 1);
    for (const b of otherBills) { expect(b.hardDeny).toBe(true); expect(b.preview).not.toMatch(/\d/); }
    for (const c of cands.filter((c) => c.category === "other_records" || c.category === "care_team")) expect(c.included).toBe(false);
    expect(cands.filter((c) => c.category === "care_team" && c.id.startsWith("careteam:")).length).toBe(provs.length - 1);
  });
  it("client, lien and wage custom fields are never included by default", () => {
    for (const c of cands.filter((c) => c.id.startsWith("custom_field:") || c.id.startsWith("contact:"))) expect(c.included).toBe(false);
    expect(cands.find((c) => c.id.startsWith("contact:"))?.category).toBe("client_pii");
  });
  it("no toggleable candidate carries a dollar figure or note text in label/preview", () => {
    for (const c of cands.filter((c) => !c.hardDeny)) expect(`${c.label} ${c.preview}`).not.toMatch(/\$|\b\d{1,3}(,\d{3})+\b|medicaid/i);
    for (const c of cands.filter((c) => c.id.startsWith("note:"))) expect(c.preview).not.toMatch(/\$|\d/);
  });
  it("a deny-toggle preset can allow liability but never a hard-deny category", () => {
    const preset: SharePreset = { allow: [...DEFAULT_PRESET.allow, "liability", "valuation", "attorney_notes"], optIn: [] };
    const c2 = buildCandidates(d, records, rid, preset);
    expect(c2.filter((c) => c.category === "liability").every((c) => c.included)).toBe(true);
    expect(c2.filter((c) => c.category === "valuation" || c.category === "attorney_notes").every((c) => !c.included)).toBe(true);
  });
  it("unknown category is excluded and treated as out of scope", () => {
    expect(isHardDeny("made_up" as ShareCategory)).toBe(false);
    const preset: SharePreset = { allow: ["made_up" as ShareCategory], optIn: [] };
    expect(buildCandidates(d, records, rid, preset).every((c) => !c.included)).toBe(true);
    expect(inScope({ category: "requests", providerContactId: "other" }, rid)).toBe(false);
    expect(inScope({ category: "other_records", providerContactId: "other" }, rid)).toBe(true);
  });
  it("without a recipient everything provider-scoped is excluded", () => {
    const c0 = buildCandidates(d, records, null, DEFAULT_PRESET);
    expect(c0.filter((c) => c.providerContactId !== null).every((c) => !c.included)).toBe(true);
    expect(c0.find((c) => c.id === ID_OWN_BILL)).toBeUndefined();
  });
  it("matter custom fields bucket into client_pii or liability by name; unknown fields are excluded entirely", () => {
    const fields = cands.filter((c) => c.id.startsWith("custom_field:"));
    expect(fields.length).toBeGreaterThan(0);
    for (const f of fields) expect(f.category).not.toBe("internal_comms");
    const byName = (re: RegExp) => cands.find((c) => c.id.startsWith("custom_field:") && re.test(c.label));
    expect(byName(/location/i)?.category).toBe("client_pii");
    expect(byName(/claim number/i)?.category).toBe("client_pii");
    expect(byName(/incident/i)?.category).toBe("client_pii");
    expect(byName(/wage/i)?.category).toBe("client_pii");
    expect(byName(/prior/i)?.category).toBe("client_pii");
    expect(byName(/liability/i)?.category).toBe("liability");
    const cf = records.find((r): r is CustomFieldValue => r.sourceType === "custom_field")!;
    const withUnknown = [...records, { ...cf, clioId: "cf-unknown", name: "Parking Validation Code", display: "Z9", value: "Z9" }];
    expect(buildCandidates(d, withUnknown, rid, DEFAULT_PRESET).find((c) => c.id === "custom_field:cf-unknown")).toBeUndefined();
    for (const f of fields) expect(f.included).toBe(false);
  });
  it("firm expenses carry description and date for audit and are never included", () => {
    const firm = records.filter((r): r is Expense => r.sourceType === "expense" && r.kind === "firm");
    expect(firm.length).toBeGreaterThan(0);
    for (const e of firm) {
      const c = cands.find((x) => x.id === `expense:${e.clioId}`)!;
      expect(c.category).toBe("firm_expenses");
      expect(c.label).toContain(e.description.slice(0, 20));
      expect(c.preview).toContain(e.date.slice(0, 10));
      expect(c.included).toBe(false);
    }
  });
  it("correspondence with the recipient becomes a dated status line, not a bare template", () => {
    const own = cands.filter((c) => c.id.startsWith("communication:") && c.providerContactId === rid);
    expect(own.length).toBeGreaterThan(0);
    for (const c of own) {
      expect(c.category).toBe("updates");
      expect(c.preview).toMatch(/(sent|received) [A-Z][a-z]{2} \d{1,2}, \d{4}$/);
    }
  });
});
