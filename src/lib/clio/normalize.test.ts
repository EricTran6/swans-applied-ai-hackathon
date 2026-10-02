import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClioRecord, Contact, Expense, Note } from "@/lib/types";
import { fetchMatterRecords, listOpenMatters } from "./index";
import { contentHash, htmlUnescape, matchProvider, normalizeExpense, normalizeNote, roleKindFor } from "./normalize";
import { loadFixtureBundle } from "./raw";

const FIXTURES = path.resolve(__dirname, "../../../fixtures/clio");
const byType = (recs: ClioRecord[], t: ClioRecord["sourceType"]) => recs.filter((r) => r.sourceType === t);

describe("normalizers on fixtures/clio", () => {
  let records: ClioRecord[];
  beforeEach(async () => {
    vi.stubEnv("CLIO_FIXTURE_DIR", FIXTURES);
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("no network in fixture mode"); }));
    records = await fetchMatterRecords("ignored-in-fixture-mode");
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("produces the expected count per type", () => {
    const counts = Object.fromEntries(
      ["matter", "custom_field", "contact", "note", "communication", "task", "calendar_entry", "expense", "document"]
        .map((t) => [t, byType(records, t as ClioRecord["sourceType"]).length]));
    expect(counts).toEqual({ matter: 1, custom_field: 16, contact: 8, note: 8, communication: 8, task: 6,
      calendar_entry: 5, expense: 6, document: 4 });
  });

  it("every record has a drawerKey, matter id and a sha256 content hash", () => {
    const matterId = byType(records, "matter")[0].clioId;
    for (const r of records) {
      expect(r.drawerKey).toBe(`${r.sourceType}:${r.clioId}`);
      expect(r.matterId).toBe(matterId);
      expect(r.contentHash).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(new Set(records.map((r) => r.drawerKey)).size).toBe(records.length);
  });

  it("splits expenses by shape and maps each bill to the right provider", () => {
    const expenses = byType(records, "expense") as Expense[];
    const contacts = byType(records, "contact") as Contact[];
    const firm = expenses.filter((e) => e.kind === "firm");
    const bills = expenses.filter((e) => e.kind === "provider_bill");
    expect(firm).toHaveLength(3);
    expect(bills).toHaveLength(3);
    for (const e of firm) { expect(e.providerContactId).toBeNull(); expect(e.billFilename).toBeNull(); }
    for (const b of bills) {
      expect(b.billFilename).toMatch(/\.pdf$/);
      const provider = contacts.find((c) => c.clioId === b.providerContactId);
      expect(provider?.roleKind).toBe("provider");
      // the provider's name words appear in the bill filename
      const first = provider!.name.split(" ")[0].toLowerCase();
      expect(b.billFilename!.toLowerCase()).toContain(first);
    }
    expect(new Set(bills.map((b) => b.providerContactId)).size).toBe(3);
    expect(bills.every((b) => b.amount > 0)).toBe(true);
  });

  it("assigns contact roles and role kinds from relationships", () => {
    const contacts = byType(records, "contact") as Contact[];
    const kinds = contacts.reduce<Record<string, number>>((m, c) => ({ ...m, [c.roleKind]: (m[c.roleKind] ?? 0) + 1 }), {});
    expect(kinds).toEqual({ client: 1, provider: 3, adverse: 2, insurer: 2 });
    const client = contacts.find((c) => c.isClient)!;
    expect(client.roleKind).toBe("client");
    expect(contacts.filter((c) => !c.isClient).every((c) => c.role)).toBe(true);
  });

  it("unescapes html entities in note text", () => {
    const notes = byType(records, "note") as Note[];
    const all = notes.map((n) => n.bodyText).join("\n");
    expect(all).not.toMatch(/&amp;|&#39;|&quot;/);
    expect(all).toContain(" & ");
    expect(all).toContain("'s");
  });

  it("matter carries custom fields, SOL and a Clio URL", () => {
    const m = byType(records, "matter")[0];
    if (m.sourceType !== "matter") throw new Error();
    expect(m.customFields).toHaveLength(16);
    expect(m.customFields.some((c) => c.clioId.startsWith("currency-") && typeof c.value === "number")).toBe(true);
    expect(m.sol).not.toBeNull();
    expect(m.clioUrl).toContain(`/matters/${m.clioId}`);
  });

  it("lists the fixture matter as an open matter", async () => {
    const list = await listOpenMatters();
    expect(list).toHaveLength(1);
    expect(list[0].clientName).toBe("Jane Doe");
  });
});

describe("content hash", () => {
  const bundle = loadFixtureBundle(FIXTURES);
  it("is unchanged when only updated_at / created_at / etag change", () => {
    const raw = bundle.notes[0];
    const a = normalizeNote(raw, "1");
    const b = normalizeNote({ ...raw, updated_at: "2030-01-01T00:00:00Z", created_at: "2030-01-01T00:00:00Z", etag: '"zzz"' }, "1");
    expect(b.updatedAt).not.toBe(a.updatedAt);
    expect(b.contentHash).toBe(a.contentHash);
  });
  it("changes when content changes", () => {
    const raw = bundle.notes[0];
    expect(normalizeNote({ ...raw, detail: `${raw.detail} more` }, "1").contentHash).not.toBe(normalizeNote(raw, "1").contentHash);
  });
  it("is deterministic and key-order independent", () => {
    const r = normalizeNote(bundle.notes[0], "1");
    const reordered = Object.fromEntries(Object.entries(r).reverse()) as ClioRecord;
    expect(contentHash(reordered)).toBe(r.contentHash);
  });
});

describe("helpers", () => {
  it("htmlUnescape handles named and numeric entities", () => {
    expect(htmlUnescape("A &amp; B &lt;c&gt; &#39;d&#x27; &quot;e&quot; &nbsp;&bogus;")).toBe(`A & B <c> 'd' "e"  &bogus;`);
  });
  it("roleKindFor uses generic keywords", () => {
    expect(roleKindFor("Treating provider, chiropractic", false)).toBe("provider");
    expect(roleKindFor("Radiology", false)).toBe("provider");
    expect(roleKindFor("Defendant", false)).toBe("adverse");
    expect(roleKindFor("Adverse party, vehicle owner (self-insured)", false)).toBe("adverse");
    expect(roleKindFor("Third-party administrator and adjuster", false)).toBe("insurer");
    expect(roleKindFor("Client no-fault insurer", false)).toBe("insurer");
    expect(roleKindFor("Witness", false)).toBe("other");
    expect(roleKindFor(null, true)).toBe("client");
  });
  it("matchProvider requires >= 60% token overlap and no tie", () => {
    const providers = [{ clioId: "1", name: "Alpha Spine Center" }, { clioId: "2", name: "Beta Imaging LLC" }];
    expect(matchProvider("07-bills__beta-imaging-bill.pdf", providers)).toBe("2");
    expect(matchProvider("alpha-bill.pdf", providers)).toBeNull(); // 1/3 tokens
    expect(matchProvider("alpha-spine.pdf", providers)).toBe("1"); // 2/3 tokens
    expect(matchProvider("unrelated.pdf", providers)).toBeNull();
  });
  it("firm vs provider_bill split is by shape only", () => {
    const base = { id: 1, date: "2020-01-01", note: "x", billed: false };
    expect(normalizeExpense({ ...base, total: 10, non_billable_total: null }, "1", []).kind).toBe("firm");
    const bill = normalizeExpense({ ...base, total: null, non_billable_total: 99, note: "Bill: a-b.pdf" }, "1", []);
    expect(bill.kind).toBe("provider_bill");
    expect(bill.amount).toBe(99);
    expect(bill.billFilename).toBe("a-b.pdf");
    expect(bill.providerContactId).toBeNull();
  });
});
