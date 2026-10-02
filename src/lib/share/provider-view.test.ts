import { describe, it, expect } from "vitest";
import type { Document, Note } from "@/lib/types";
import { buildProviderShare } from "./provider-view";
import { buildCandidates, buildProviderView, DEFAULT_PRESET, ID_COVERAGE, ID_COVERAGE_LIMITS, ID_OWN_BILL, ID_STATUS, stageLabel, clientDisplayName } from "./index";
import { fixtureDigest, fixtureProviders, fixtureRecords, FIXTURE_NOW } from "./__tests__/fixture-records";

const d = fixtureDigest();
const records = fixtureRecords();
const provs = fixtureProviders(records);
const allIds = (rid: string | null) => buildCandidates(d, records, rid, DEFAULT_PRESET).map((c) => c.id);
const defaultIds = (rid: string | null) => buildCandidates(d, records, rid, DEFAULT_PRESET).filter((c) => c.included).map((c) => c.id);
const view = (rid: string | null, ids: string[], note: string | null = null) =>
  buildProviderView(d, records, ids, { label: provs.find((p) => p.clioId === rid)?.name ?? "Unknown", contactId: rid }, note, FIXTURE_NOW);

describe("ProviderView leak tests (every fixture provider)", () => {
  const notes = records.filter((r): r is Note => r.sourceType === "note");
  const client = d.header.clientName; // "Jane Doe" in the synthetic fixture
  const caseValue = d.kpis.find((k) => k.key === "case_value")!.value!;
  const lienAmounts = d.valueWaterfall.filter((w) => /lien/i.test(w.label)).map((w) => Math.abs(w.amount));

  for (const p of provs) {
    for (const [label, ids] of [["default inclusion", defaultIds(p.clioId)], ["EVERY candidate id forced in", allIds(p.clioId)]] as const) {
      it(`${p.name}: ${label} leaks nothing`, () => {
        const v = view(p.clioId, [...ids, ID_COVERAGE_LIMITS, "note:999", "kpi:case_value", "digest:brief"]);
        const json = JSON.stringify(v);
        // valuation / specials / liens
        expect(json).not.toMatch(new RegExp(String(caseValue)));
        expect(json).not.toMatch(new RegExp(caseValue.toLocaleString("en-US")));
        for (const a of lienAmounts) { expect(json).not.toContain(String(a)); expect(json).not.toContain(a.toLocaleString("en-US")); }
        expect(json).not.toMatch(/medicaid|medicare/i);
        expect(json).not.toMatch(/strategy|posture|privileged|settle|demand|offer/i);
        // other providers' bills
        for (const b of d.providerBills) {
          if (b.providerContactId === p.clioId) continue;
          expect(json).not.toContain(String(b.amount));
          expect(json).not.toContain(b.amount.toLocaleString("en-US"));
        }
        // note text and client PII
        for (const n of notes) {
          const firstSentence = n.bodyText.split(/[.;]/)[0].trim();
          if (firstSentence.length > 12) expect(json).not.toContain(firstSentence);
        }
        expect(json).not.toContain(client);
        expect(v.clientDisplayName).toBe("Jane D.");
        // no Clio ids / urls / drawer keys
        expect(json).not.toMatch(/clioId|drawerKey|clioUrl|app\.clio\.com/);
        // dollars only in coverage layers (toggled on here) and own bill
        const { coverage: _c, bill: _b, ...rest } = v; void _c; void _b;
        expect(JSON.stringify(rest)).not.toMatch(/\$|\b\d{1,3}(,\d{3})+\b/);
      });
    }
  }

  it("without a recipient contact nothing provider-scoped is shared", () => {
    const v = view(null, allIds(null));
    expect(v.needs).toEqual([]); expect(v.bill).toBeNull(); expect(v.records).toEqual([]); expect(v.appointments).toEqual([]);
  });
});

describe("per-provider scoping", () => {
  const withBill = d.providerBills.find((b) => b.servicesThrough)!; // the fixture provider with a dated bill
  const other = provs.find((p) => p.clioId !== withBill.providerContactId)!;

  it("own bill with stale flag when services ended >90 days ago and treatment continues", () => {
    const v = view(withBill.providerContactId, defaultIds(withBill.providerContactId));
    expect(v.bill).toEqual({ amount: withBill.amount, servicesThrough: withBill.servicesThrough, stale: true });
  });
  it("another provider never gets that bill even when its id is forced", () => {
    const v = view(other.clioId, [...defaultIds(other.clioId), ID_OWN_BILL, `bill:${withBill.providerContactId}`]);
    expect(v.bill === null || v.bill.amount !== withBill.amount).toBe(true);
    expect(JSON.stringify(v)).not.toContain(String(withBill.amount));
  });
  it("needs are only this provider's open tasks, templated", () => {
    const v = view(withBill.providerContactId, defaultIds(withBill.providerContactId));
    expect(v.needs.length).toBeGreaterThan(0);
    for (const n of v.needs) { expect(n.text).toMatch(/^(Send|Confirm)/); expect(n.text).not.toMatch(/By medical provider|\d{4}-\d{2}-\d{2}/); }
    const share = (r: string) => buildProviderShare(d, records, defaultIds(r), { label: "x", contactId: r }, null, FIXTURE_NOW);
    const mine = share(withBill.providerContactId!);
    const theirs = share(other.clioId);
    expect(Object.values(theirs.needMap)).not.toEqual(Object.values(mine.needMap));
  });
  it("need ids are opaque per share; the task mapping stays server-side", () => {
    for (const p of provs) {
      const { view: v, needMap } = buildProviderShare(d, records, allIds(p.clioId), { label: "x", contactId: p.clioId }, null, FIXTURE_NOW);
      const json = JSON.stringify(v);
      expect(json).not.toMatch(/task:/);
      for (const n of v.needs) expect(n.id).not.toMatch(/\d{4,}/); // no Clio-id-looking digits in need ids
      for (const cid of Object.values(needMap).map((k) => k.split(":")[1])) expect(json).not.toContain(cid);
      v.needs.forEach((n, i) => {
        expect(n.id).toBe(`need-${i + 1}`);
        expect(needMap[n.id]).toMatch(/^task:\d+$/);
      });
      expect(Object.keys(needMap)).toHaveLength(v.needs.length);
    }
  });
  it("other providers' records are opt-in per item and other tasks are refused even if forced", () => {
    const cands = buildCandidates(d, records, other.clioId, DEFAULT_PRESET);
    const otherRecords = cands.filter((c) => c.category === "other_records");
    expect(otherRecords.every((c) => !c.included && !c.hardDeny)).toBe(true);
    const foreignTask = cands.find((c) => c.category === "requests" && c.providerContactId && c.providerContactId !== other.clioId)!;
    expect(foreignTask.included).toBe(false);
    const v = view(other.clioId, [...defaultIds(other.clioId), ...otherRecords.map((c) => c.id), foreignTask.id]);
    expect(v.records.length).toBe(otherRecords.length);
    expect(v.needs.find((n) => n.id === foreignTask.id)).toBeUndefined();
  });
  it("appointments are future entries naming this provider only", () => {
    const v = view(withBill.providerContactId, defaultIds(withBill.providerContactId));
    expect(v.appointments.length).toBe(1);
    expect(v.appointments[0].date >= "2026-10-02").toBe(true);
    expect(view(other.clioId, defaultIds(other.clioId)).appointments).toEqual([]);
  });
});

describe("coverage, status, stage, updates, care team", () => {
  const rid = provs[0].clioId;
  it("coverage shows confirmed/date only; layers only with the limits toggle", () => {
    const v = view(rid, [ID_COVERAGE]);
    expect(v.coverage).toEqual({ confirmed: true, confirmedOn: "2026-09-05", layers: null });
    const v2 = view(rid, [ID_COVERAGE, ID_COVERAGE_LIMITS]);
    expect(v2.coverage?.layers).toEqual([{ kind: "Liability", limit: "$250,000" }]);
    expect(view(rid, [ID_COVERAGE_LIMITS]).coverage).toBeNull();
    expect(view(rid, []).coverage).toBeNull();
  });
  it("status is active with last firm activity and next event dates; withheld when not included", () => {
    const appt = "calendar_entry:100061"; // Riverside PT treatment visit on 2026-10-06
    const v = view(rid, [ID_STATUS, appt]);
    expect(v.status).toEqual({ label: "Active", alive: "active", lastFirmActivity: "2026-09-28", nextEvent: "2026-10-06" });
    expect(view(rid, []).status.lastFirmActivity).toBeNull();
  });
  it("nextEvent is only the recipient's own shared treatment appointment (never court/other-provider dates)", () => {
    const court = "calendar_entry:100062"; // compliance conference
    expect(view(rid, [ID_STATUS, court]).status.nextEvent).toBeNull();
    for (const p of provs.filter((x) => x.clioId !== rid)) {
      expect(view(p.clioId, [ID_STATUS, ...allIds(p.clioId), "calendar_entry:100061", court]).status.nextEvent).toBeNull();
    }
  });
  it("updates are deduped by text: one entry per templated sentence", () => {
    const t4 = d.timeline.find((t) => t.id === "t4")!;
    const dup = { ...d, timeline: [...d.timeline, { ...t4, id: "t4b", date: "2025-04-01" }] };
    const cands = buildCandidates(dup, records, rid, DEFAULT_PRESET).filter((c) => c.category === "updates" && c.providerContactId == null);
    const texts = cands.map((c) => c.label);
    expect(new Set(texts).size).toBe(texts.length);
    const v = buildProviderView(dup, records, cands.map((c) => c.id), { label: "x", contactId: rid }, null, FIXTURE_NOW);
    expect(v.updates.filter((u) => u.text === "Lawsuit filed")).toEqual([{ date: "2025-04-01", text: "Lawsuit filed" }]);
  });
  it("stage maps to the coarse label", () => {
    expect(view(rid, defaultIds(rid)).stage.label).toBe("In litigation");
    expect(stageLabel("treatment", "Open")).toBe("Treating");
    expect(stageLabel("negotiation", "Open")).toBe("Pre-suit negotiation");
    expect(stageLabel("settlement", "Open")).toBe("Settled / paying liens");
    expect(stageLabel("discovery", "Closed")).toBe("Closed");
  });
  it("updates are templated sentences from structured events, newest first", () => {
    const v = view(rid, defaultIds(rid));
    expect(v.updates.map((u) => u.text)).toContain("Lawsuit filed");
    expect(v.updates.map((u) => u.text)).toContain("Insurance coverage confirmed in writing");
    expect(v.updates.map((u) => u.date)).toEqual([...v.updates.map((u) => u.date)].sort().reverse());
  });
  it("findings fail closed when the cited document is not in the matter's records", () => {
    // the sample digest cites a document id that the raw fixtures do not contain
    expect(buildCandidates(d, records, rid, DEFAULT_PRESET).some((c) => c.id.startsWith("finding:"))).toBe(false);
  });
  it("care team and findings appear only when opted in (HIPAA field true in fixture) and cite document pages", () => {
    const base = view(rid, defaultIds(rid));
    expect(base.careTeam).toBeUndefined(); expect(base.findings).toBeUndefined();
    const medRec = records.find((r): r is Document => r.sourceType === "document" && /medical-records/i.test(r.filename))!;
    const withBop = [...records, { ...medRec, clioId: d.injuries[0].refs[0].clioId }];
    const cands = buildCandidates(d, withBop, rid, DEFAULT_PRESET);
    const optIn = cands.filter((c) => c.category === "care_team").map((c) => c.id);
    const v = buildProviderView(d, withBop, [...defaultIds(rid), ...optIn], { label: "x", contactId: rid }, null, FIXTURE_NOW);
    expect(v.careTeam?.length).toBe(provs.length - 1);
    expect(v.findings?.length).toBe(d.injuries.length);
    for (const f of v.findings!) expect(f.source).toMatch(/ p\d+$/);
  });
  it("findings are refused when the source is a pleading/demand/settlement doc, not a medical record", () => {
    const bop = records.find((r): r is Document => r.sourceType === "document" && /particulars/i.test(r.filename))!;
    for (const [folder, filename] of [[bop.folder ?? "02 Pleadings", bop.filename], ["06 Demand", "06-demand__demand-letter.pdf"], ["07 Settlement", "07-settlement__release.pdf"]] as const) {
      const withDoc = [...records, { ...bop, folder, filename, clioId: d.injuries[0].refs[0].clioId }];
      expect(buildCandidates(d, withDoc, rid, DEFAULT_PRESET).some((c) => c.id.startsWith("finding:"))).toBe(false);
    }
  });
  it("care team entries whose name or role trips the leak filter are dropped", () => {
    const leaky = records.map((r) => (r.sourceType === "contact" && r.roleKind === "provider" && r.clioId !== rid ? { ...r, name: `${r.name} Lien Funding` } : r));
    const cands = buildCandidates(d, leaky, rid, DEFAULT_PRESET);
    expect(cands.some((c) => c.category === "care_team" && c.id.startsWith("careteam:"))).toBe(false);
  });
  it("care team is withheld when the HIPAA field is not true", () => {
    const noHipaa = records.map((r) => (r.sourceType === "custom_field" && /hipaa/i.test(r.name) ? { ...r, value: false } : r))
      .map((r) => (r.sourceType === "matter" ? { ...r, customFields: r.customFields.map((cf) => (/hipaa/i.test(cf.name) ? { ...cf, value: false } : cf)) } : r));
    const cands = buildCandidates(d, noHipaa, rid, DEFAULT_PRESET);
    const ids = cands.map((c) => c.id);
    const v = buildProviderView(d, noHipaa, ids, { label: "x", contactId: rid }, null, FIXTURE_NOW);
    expect(v.careTeam).toBeUndefined(); expect(v.findings).toBeUndefined();
  });
  it("findings never come from expert/IME documents", () => {
    const expertDocs = records.map((r) => (r.sourceType === "document" ? { ...(r as Document), folder: "08 Experts", filename: "08-experts__ime-report.pdf" } : r));
    const cands = buildCandidates(d, expertDocs, rid, DEFAULT_PRESET);
    expect(cands.some((c) => c.id.startsWith("finding:"))).toBe(false);
  });
  it("attorney note is trimmed and capped at 1,000 chars; sharedAt/expiresAt use now + TTL", () => {
    const v = view(rid, [], `  ${"x".repeat(1200)}  `);
    expect(v.attorneyNote?.length).toBe(1000);
    expect(view(rid, [], "   ").attorneyNote).toBeNull();
    expect(v.sharedAt).toBe(FIXTURE_NOW.toISOString());
    expect(new Date(v.expiresAt).getTime() - FIXTURE_NOW.getTime()).toBe(7 * 86_400_000);
  });
  it("clientDisplayName is first name + last initial", () => {
    expect(clientDisplayName(null, "Mary Ann Smith-Jones")).toBe("Mary S.");
    expect(clientDisplayName(null, "")).toBe("Client");
  });
});
