import { describe, expect, it } from "vitest";
import { computeDeterministic, diffSince, inputSetHash, validateRefs } from "@/lib/digest";
import type { ClioRecord, DocumentText, Note } from "@/lib/types";
import { fixtureFacts, fixtureRecords } from "./fixture-records";

const now = new Date("2026-10-02T12:00:00Z");
function build() {
  const { matter, records } = fixtureRecords();
  return { matter, records, d: computeDeterministic({ matter, records, facts: fixtureFacts(records), changeFeed: [], now }) };
}
const kpi = (d: ReturnType<typeof build>["d"], k: string) => d.kpis.find((x) => x.key === k)!;

describe("KPIs", () => {
  it("firm spend sums firm expenses only", () => {
    expect(kpi(build().d, "firm_spend").value).toBe(735);
  });
  it("specials sums provider bills and agrees with the specials custom field", () => {
    const s = kpi(build().d, "specials");
    expect(s.value).toBe(41250);
    expect(s.status).toBe("ok");
  });
  it("specials warns on mismatch with the custom field", () => {
    const { matter, records } = fixtureRecords();
    const recs = records.filter((r) => !(r.sourceType === "expense" && r.kind === "provider_bill" && r.amount === 2750));
    const d = computeDeterministic({ matter, records: recs, facts: null, changeFeed: [], now });
    const s = kpi(d, "specials");
    expect(s.value).toBe(38500);
    expect(s.status).toBe("warn");
    expect(s.note).toMatch(/41,250/);
  });
  it("last client contact is the latest client communication (phone counts)", () => {
    const { d } = build();
    const k = kpi(d, "last_client_contact");
    expect(k.value).toBe(4);
    expect(k.refs[0].sourceDate?.slice(0, 10)).toBe("2026-09-28");
    expect(d.client.lastContact?.kind).toBe("Phone");
    expect(d.client.lastContact?.date).toBe("2026-09-28");
  });
  it("case value comes from the currency custom field, capped by BI", () => {
    const k = kpi(build().d, "case_value");
    expect(k.value).toBe(600000);
    expect(k.range?.cap).toBe(250000);
    expect(k.refs[0].sourceType).toBe("custom_field");
  });
  it("coverage: UM/UIM below BI adds nothing; conflicts carried", () => {
    const k = kpi(build().d, "coverage");
    expect(k.value).toBe(250000);
    expect(k.conflicts?.length).toBe(1);
  });
  it("coverage: exhausted layers are excluded and UM above BI adds the excess", () => {
    const { matter, records } = fixtureRecords();
    const f = fixtureFacts(records);
    f.coverage = [
      { kind: "BI", perPerson: 100000, perAccident: null, carrier: null, refs: [] },
      { kind: "UM/UIM", perPerson: 150000, perAccident: null, carrier: null, refs: [] },
      { kind: "Umbrella", perPerson: 1000000, perAccident: null, carrier: null, exhausted: true, refs: [] },
    ];
    const d = computeDeterministic({ matter, records, facts: f, changeFeed: [], now });
    expect(kpi(d, "coverage").value).toBe(150000);
  });
  it("next deadline is the earliest future open task or calendar entry", () => {
    const k = kpi(build().d, "next_deadline");
    expect(k.refs[0].drawerKey).toBe("task:100052");
  });
});

describe("waterfall and provider bills", () => {
  it("cap minus liens minus firm costs", () => {
    const w = build().d.valueWaterfall;
    expect(w.map((s) => s.amount)).toEqual([250000, -9400, -735, 239865]);
    expect(w[w.length - 1]).toMatchObject({ kind: "result", label: "Before attorney fees" });
  });
  it("groups provider bills and parses services-through", () => {
    const b = build().d.providerBills;
    expect(b.reduce((s, x) => s + x.amount, 0)).toBe(41250);
    const rv = b.find((x) => x.providerContactId === "810001")!;
    expect(rv.servicesThrough).toBe("2025-01-08");
    expect(rv.providerName).toMatch(/Riverside/);
  });
});

describe("action board", () => {
  it("two overdue: provider and client tasks; SOL is satisfied, never overdue", () => {
    const { d } = build();
    expect(d.actionBoard.overdue.map((a) => a.id).sort()).toEqual(["task:100048", "task:100050"]);
    expect(d.header.sol?.status).toBe("satisfied");
    const lv = d.actionBoard.overdue.find((a) => a.id === "task:100048")!;
    expect(lv.waitingOn).toMatchObject({ contactId: "810002", kind: "provider", requests: 3, daysSilent: 93 });
    expect(lv.daysLate).toBe(33);
    expect(d.actionBoard.waiting.some((a) => a.id === "task:100048")).toBe(true);
  });
  it("upcoming within 30 days includes tasks and calendar entries", () => {
    const ids = build().d.actionBoard.upcoming.map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(["task:100052", "task:100054", "calendar_entry:100062"]));
    expect(ids).not.toContain("task:100048");
  });
});

describe("top ten, timeline, stage, client", () => {
  it("ranks unique items 1..n, at most 10, why empty", () => {
    const { d, records } = build();
    expect(d.topTen.length).toBe(10);
    expect(d.topTen.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(new Set(d.topTen.map((r) => r.ref.drawerKey)).size).toBe(10);
    expect(d.topTen.every((r) => r.why === "")).toBe(true);
    expect(d.totalItems).toBe(records.filter((r) => r.sourceType !== "custom_field").length);
    expect(d.topTen.map((r) => r.ref.drawerKey)).toContain("note:100028");
  });
  it("timeline marks generic milestones", () => {
    const ms = build().d.timeline.filter((e) => e.milestone).map((e) => e.date);
    expect(ms).toEqual(expect.arrayContaining(["2024-03-10", "2024-06-04", "2025-03-01", "2026-10-21"]));
    const t = build().d.timeline;
    expect([...t].map((e) => e.date)).toEqual([...t].map((e) => e.date).sort());
  });
  it("stage maps litigation + conference evidence to discovery", () => {
    expect(build().d.stage.key).toBe("discovery");
  });
  it("client snapshot: age and next touchpoint", () => {
    const c = build().d.client;
    expect(c.age).toBe(36);
    expect(c.initials).toBe("JD");
    expect(c.nextTouchpoint?.date).toBe("2026-10-06");
    expect(build().d.header.incidentDate?.value).toBe("2024-03-10");
  });
});

describe("validateRefs", () => {
  const { records } = fixtureRecords();
  it("verifies a quote with different case and line breaks, drops unknown ids", () => {
    const r = validateRefs([
      { id: "note:100026", quote: "ADJUSTER CONFIRMED IN\nWRITING:  LIABILITY\r\nLIMITS" },
      { id: "note:999999", quote: "anything" },
    ], records, []);
    expect(r.dropped).toBe(1);
    expect(r.refs).toHaveLength(1);
    expect(r.refs[0]).toMatchObject({ clioId: "100026", quoteVerified: true, derivation: "stated", drawerKey: "note:100026" });
  });
  it("normalizes curly quotes and handles ALL-CAPS document page text", () => {
    const recs: ClioRecord[] = [...records, { ...(records.find((x) => x.drawerKey === "note:100014") as Note), clioId: "1", drawerKey: "note:1",
      bodyText: "She said “it hurts”" }];
    const docs: DocumentText[] = [{ clioId: "100076", versionUuid: null, pageCount: 3,
      pages: ["", "", "PLAINTIFF SUSTAINED A TEAR OF THE\nLEFT SHOULDER\nLABRUM"] }];
    const r = validateRefs([
      { id: "note:1", quote: 'she said "it hurts"' },
      { id: "document:100076", quote: "tear of the left shoulder labrum", page: 3 },
      { id: "document:100076", quote: "not there", page: 3 },
      { id: "document:100076", quote: "x", page: 9 },
      { id: "note:100026", quote: "not in the note" },
    ], recs, docs);
    expect(r.refs.map((x) => x.drawerKey)).toEqual(["note:1", "document:100076#p3"]);
    expect(r.dropped).toBe(3);
    expect(r.refs[1].page).toBe(3);
  });
  it("null quote only for structured records", () => {
    const r = validateRefs([{ id: "task:100048", quote: null }, { id: "note:100026", quote: null }], records, []);
    expect(r.refs.map((x) => x.drawerKey)).toEqual(["task:100048"]);
    expect(r.refs[0].derivation).toBe("clio-metadata");
  });
});

describe("hash and diff", () => {
  it("inputSetHash is order-independent and content-sensitive", () => {
    const { records } = fixtureRecords();
    const h = inputSetHash(records);
    expect(inputSetHash([...records].reverse())).toBe(h);
    const changed = records.map((r, i) => (i === 3 ? { ...r, contentHash: "x" } : r));
    expect(inputSetHash(changed)).not.toBe(h);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
  it("diffSince returns records with sourceDate on/after the date", () => {
    const { records } = fixtureRecords();
    const c = diffSince(records, "2026-09-20");
    expect(c.length).toBeGreaterThan(0);
    expect(c.every((e) => (e.sourceDate ?? "") >= "2026-09-20")).toBe(true);
    expect(c.map((e) => e.drawerKey)).toContain("communication:100040");
    expect(c.map((e) => e.drawerKey)).not.toContain("note:100024");
  });
});
