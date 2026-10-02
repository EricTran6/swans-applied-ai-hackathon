import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, repos, setDbForTests } from "@/lib/db";
import type { ActionItem, Digest, MatterSummary } from "@/lib/types";
import { bucketActions, summarizeShares, topAttention } from "./build";
import type { MattersOverviewResponse } from "./route";

const clio = vi.hoisted(() => ({
  listOpenMatters: vi.fn(),
  fetchMatterRecords: vi.fn(),
  clioGet: vi.fn(),
  clioFetch: vi.fn(),
  downloadDocument: vi.fn(),
}));
const auth = vi.hoisted(() => ({ token: "t" as string | null }));
vi.mock("@/lib/clio", () => clio);
vi.mock("@/lib/auth", () => ({ getClioAccessToken: async () => auth.token }));

const SAMPLE = JSON.parse(fs.readFileSync(path.join(process.cwd(), "fixtures/sample-digest.json"), "utf8")) as Digest;
const M1: MatterSummary = { clioId: SAMPLE.matterId, displayNumber: "00001-Doe", description: "Synthetic", clientName: "Jane Doe", status: "Open" };
const M2: MatterSummary = { clioId: "m-empty", displayNumber: "00002-Roe", description: "Synthetic 2", clientName: "Richard Roe", status: "Open" };

async function loadRoute() {
  vi.resetModules();
  return (await import("./route")).GET;
}
const req = (cookie?: string) => new Request("http://127.0.0.1:3000/api/matters/overview", { headers: cookie ? { cookie } : {} });
const VIEWER = "viewer-abcdefghijklmnop";

function insertDigest(d: Digest) {
  repos().digests.insert(d, "v1", d.meta.costUsd); // insert assigns the version
}

beforeEach(() => {
  setDbForTests(openDb(":memory:"));
  auth.token = "t";
  for (const f of Object.values(clio)) f.mockReset();
  clio.listOpenMatters.mockResolvedValue([M1, M2]);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("no network in tests"); }));
});

describe("GET /api/matters/overview", () => {
  it("returns 401 when Clio is not connected", async () => {
    auth.token = null;
    const res = await (await loadRoute())(req());
    expect(res.status).toBe(401);
    expect(clio.listOpenMatters).not.toHaveBeenCalled();
  });

  it("returns 502 when the matter list fails", async () => {
    clio.listOpenMatters.mockRejectedValue(new Error("boom"));
    const res = await (await loadRoute())(req());
    expect(res.status).toBe(502);
  });

  it("returns digest null for an undigested matter and correct counts otherwise", async () => {
    insertDigest(SAMPLE);
    const r = repos();
    r.viewState.upsert(VIEWER, M1.clioId, "2026-09-01T00:00:00Z", 1);
    const ev = { matterId: M1.clioId, sourceType: "note" as const, kind: "new" as const, contentHash: "h", prevHash: null, title: "x", sourceDate: null };
    r.events.insert({ ...ev, clioId: "1", detectedAt: "2026-08-01T00:00:00Z" });
    r.events.insert({ ...ev, clioId: "2", detectedAt: "2026-09-05T00:00:00Z" });
    r.events.insert({ ...ev, clioId: "3", detectedAt: "2026-09-06T00:00:00Z" });
    const base = { tokenHash: "", presetJson: "{}", includedIdsJson: "[]", payloadJson: "{}", attorneyNote: null, sharedCount: 1, withheldCount: 0, digestVersion: 1, expiresAt: "2099-01-01T00:00:00Z", recipientContactId: null };
    r.shares.insert({ ...base, id: "s1", matterId: M1.clioId, tokenHash: "a", recipientLabel: "Provider A", createdAt: "2026-09-10T00:00:00Z", revokedAt: null });
    r.shares.insert({ ...base, id: "s2", matterId: M1.clioId, tokenHash: "b", recipientLabel: "Provider B", createdAt: "2026-09-11T00:00:00Z", revokedAt: null });
    r.shareViews.insert("s1", "2026-09-12T10:42:00Z", null, null);
    r.shareResponses.insert({ id: "r1", shareId: "s1", needId: null, kind: "will_send", promisedDate: "2026-10-09", text: null, createdAt: "2026-09-12T11:00:00Z" });

    const res = await (await loadRoute())(req(`viewer=${VIEWER}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as MattersOverviewResponse;
    expect(body.matters).toHaveLength(2);
    const [a, b] = body.matters;
    expect(b.matter.clioId).toBe("m-empty");
    expect(b.digest).toBeNull();
    expect(b.shares).toMatchObject({ total: 0, opened: 0, lastViewedAt: null, latestReply: null });

    expect(a.digest).not.toBeNull();
    expect(a.digest!.version).toBe(1);
    expect(a.digest!.newSinceOpen).toBe(2);
    expect(a.digest!.waiting).toBe(SAMPLE.actionBoard.waiting.length);
    expect(a.digest!.kpis.map((k) => k.key)).toEqual(["case_value", "coverage", "specials", "next_deadline", "last_client_contact"]);
    expect(a.digest!.topAttention.length).toBeLessThanOrEqual(3);
    expect(a.shares).toMatchObject({ total: 2, opened: 1, lastViewedAt: "2026-09-12T10:42:00Z" });
    expect(a.shares.latestReply).toMatchObject({ recipientLabel: "Provider A", kind: "will_send", promisedDate: "2026-10-09" });
    expect(a.shares.recent[0].kind).toBe("replied");
  });

  it("reports newSinceOpen null for a viewer that never opened the matter", async () => {
    insertDigest(SAMPLE);
    const body = (await (await (await loadRoute())(req())).json()) as MattersOverviewResponse;
    expect(body.matters[0].digest!.newSinceOpen).toBeNull();
  });

  it("makes no Clio call besides the cached matter list", async () => {
    insertDigest(SAMPLE);
    const GET = await loadRoute();
    await GET(req());
    await GET(req());
    expect(clio.listOpenMatters).toHaveBeenCalledTimes(1);
    for (const [name, f] of Object.entries(clio)) if (name !== "listOpenMatters") expect(f).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});

const item = (over: Partial<ActionItem> & { id: string }): ActionItem => ({
  title: over.id, due: null, owner: null, origin: "clio-task", refs: [], ...over,
});

describe("bucketActions", () => {
  const now = Date.parse("2026-10-02T12:00:00Z");
  it("moves passed upcoming items to overdue and keeps only the next 7 days", () => {
    const b = bucketActions({
      overdue: [item({ id: "o1", due: "2026-09-20" })],
      upcoming: [item({ id: "u-past", due: "2026-10-01" }), item({ id: "u-today", due: "2026-10-02" }),
        item({ id: "u-7", due: "2026-10-09" }), item({ id: "u-far", due: "2026-10-20" })],
      waiting: [item({ id: "w1" })], suggested: [],
    }, now);
    expect(b.overdue.map((a) => a.id)).toEqual(["o1", "u-past"]);
    expect(b.overdue.map((a) => a.daysLate)).toEqual([12, 1]);
    expect(b.upcoming7d.map((a) => a.id)).toEqual(["u-today", "u-7"]);
    expect(b.waiting).toHaveLength(1);
  });
});

describe("topAttention", () => {
  const ref = (k: string) => ({ value: "", sourceType: "task" as const, clioId: k, sourceDate: null, quote: null, drawerKey: `task:${k}`, derivation: "clio-metadata" as const, quoteVerified: false });
  it("orders overdue (most late first) before waiting (longest silent first), dedupes, caps at 3", () => {
    const wo = (d: number) => ({ name: "P", contactId: null, kind: "provider" as const, requests: 1, daysSilent: d });
    const out = topAttention(
      [item({ id: "a", daysLate: 2, refs: [ref("1")] }), item({ id: "b", daysLate: 9, refs: [ref("2")] })],
      [item({ id: "c", waitingOn: wo(3), refs: [ref("3")] }), item({ id: "dup", waitingOn: wo(50), refs: [ref("2")] }), item({ id: "d", waitingOn: wo(20), refs: [ref("4")] })],
    );
    expect(out.map((x) => x.title)).toEqual(["b", "a", "d"]);
    expect(out[2]).toMatchObject({ kind: "waiting", daysSilent: 20, drawerKey: "task:4" });
  });
});

describe("summarizeShares", () => {
  it("ignores revoked shares and truncates long replies", () => {
    const long = "x".repeat(400);
    const s = summarizeShares([
      { shareId: "1", recipientLabel: "A", recipientContactId: null, createdAt: "", expiresAt: "", revokedAt: "2026-01-01", views: 3, firstViewedAt: "2026-09-01", lastViewedAt: "2026-09-30", sharedCount: 0, withheldCount: 0, responses: [] },
      { shareId: "2", recipientLabel: "B", recipientContactId: null, createdAt: "", expiresAt: "", revokedAt: null, views: 0, firstViewedAt: null, lastViewedAt: null, sharedCount: 0, withheldCount: 0,
        responses: [{ id: "r", shareId: "2", needId: null, kind: "note", promisedDate: null, text: long, createdAt: "2026-09-02" }] },
    ]);
    expect(s).toMatchObject({ total: 1, opened: 0, lastViewedAt: null });
    expect(s.latestReply!.text!.length).toBeLessThanOrEqual(160);
  });
});
