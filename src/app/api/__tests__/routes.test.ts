import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, repos, setDbForTests } from "@/lib/db";
import type { ClioRecord, ProviderView } from "@/lib/types";

vi.mock("@/lib/share", () => ({
  DEFAULT_PRESET: { allow: [], optIn: [] },
  hashToken: (t: string) => createHash("sha256").update(t).digest("hex"),
  newShareToken: () => ({ token: "tok-live", tokenHash: createHash("sha256").update("tok-live").digest("hex") }),
  buildCandidates: () => [
    { id: "task:1", category: "requests", included: true, hardDeny: false },
    { id: "kpi:value", category: "valuation", included: false, hardDeny: true },
  ],
  buildProviderView: (_d: unknown, _r: unknown, ids: string[]) => ({ needs: [{ id: "task:1", text: "x", due: null }], ids }),
}));
vi.mock("@/lib/clio", () => ({ listOpenMatters: async () => [] }));
vi.mock("@/lib/ingest", () => ({ loadRecords: () => [], syncMatter: async () => ({ records: [], events: [], documentTexts: [] }), getDocumentText: () => null }));
vi.mock("@/lib/ai", () => ({ buildDigest: async () => ({}) }));
vi.mock("@/lib/digest", () => ({ inputSetHash: () => "h", diffSince: () => [] }));

import { POST as createShare } from "../share/route";
import { GET as getShare } from "../share/[token]/route";
import { POST as viewShare } from "../share/[token]/view/route";
import { POST as respond } from "../share/[token]/respond/route";
import { POST as revoke } from "../share/revoke/route";
import { GET as getFile } from "../documents/[id]/file/route";
import { GET as getSource } from "../source/route";

const post = (body: unknown) => new Request("http://x/api", { method: "POST", body: JSON.stringify(body) });
const ctx = (token: string) => ({ params: Promise.resolve({ token }) });

async function makeShare(): Promise<string> {
  repos().digests.insert({ matterId: "m1", inputSetHash: "h", createdAt: "2026-01-01" } as never, "v1", 0);
  const res = await createShare(post({ matterId: "m1", recipientLabel: "P", includedIds: ["task:1", "kpi:value", "bogus:9", "coverage:limits"] }));
  expect(res.status).toBe(201);
  const { shareId, url } = await res.json();
  expect(url.endsWith("/s/tok-live")).toBe(true);
  return shareId;
}

beforeEach(() => { setDbForTests(openDb(":memory:")); });

describe("share routes", () => {
  it("fails closed on included ids but passes the synthetic coverage toggle", async () => {
    const id = await makeShare();
    const row = repos().shares.get(id)!;
    expect(JSON.parse(row.includedIdsJson)).toEqual(["task:1", "coverage:limits"]);
  });
  it("serves a live share with privacy headers", async () => {
    await makeShare();
    const res = await getShare(new Request("http://x"), ctx("tok-live"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
    expect((await res.json() as ProviderView).needs).toHaveLength(1);
  });
  it("returns an identical 404 for unknown, revoked and expired tokens", async () => {
    const id = await makeShare();
    const unknown = await getShare(new Request("http://x"), ctx("nope"));
    expect((await revoke(post({ shareId: id }))).status).toBe(204);
    const revoked = await getShare(new Request("http://x"), ctx("tok-live"));
    // expired
    setDbForTests(openDb(":memory:"));
    await makeShare();
    repos();
    const db = (await import("@/lib/db")).getDb();
    db.prepare("UPDATE shares SET expires_at='2000-01-01T00:00:00Z'").run();
    const expired = await getShare(new Request("http://x"), ctx("tok-live"));
    const bodies = await Promise.all([unknown, revoked, expired].map(async (r) => [r.status, await r.text(), r.headers.get("Cache-Control")]));
    expect(bodies[0]).toEqual([404, '{"error":"not found"}', "no-store"]);
    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[2]).toEqual(bodies[0]);
    expect((await viewShare(post({}), ctx("tok-live"))).status).toBe(404);
  });
  it("records views once the share is live", async () => {
    const id = await makeShare();
    expect((await viewShare(post({}), ctx("tok-live"))).status).toBe(204);
    expect(repos().shareViews.stats(id).views).toBe(1);
  });
  it("respond rejects a bad kind, long text, unknown need; accepts valid", async () => {
    const id = await makeShare();
    expect((await respond(post({ kind: "bogus" }), ctx("tok-live"))).status).toBe(400);
    expect((await respond(post({ kind: "note", text: "a".repeat(1001) }), ctx("tok-live"))).status).toBe(400);
    expect((await respond(post({ kind: "sent", needId: "task:999" }), ctx("tok-live"))).status).toBe(400);
    expect((await respond(post({ kind: "sent", needId: "task:1" }), ctx("tok-live"))).status).toBe(204);
    expect(repos().shareResponses.listByShare(id)).toHaveLength(1);
    expect((await respond(post({ kind: "note" }), ctx("nope"))).status).toBe(404);
  });
  it("rejects an oversized attorney note", async () => {
    const res = await createShare(post({ matterId: "m1", recipientLabel: "P", includedIds: [], attorneyNote: "a".repeat(1001) }));
    expect(res.status).toBe(400);
  });
});

describe("documents and source routes", () => {
  const doc = { sourceType: "document", clioId: "55", matterId: "m1", drawerKey: "document:55", contentHash: "h", etag: null, title: "d" } as unknown as ClioRecord;
  it("rejects a document id not in the DB or malformed", async () => {
    expect((await getFile(new Request("http://x"), ctx2("999"))).status).toBe(404);
    expect((await getFile(new Request("http://x"), ctx2("../../etc/passwd"))).status).toBe(404);
  });
  it("streams the cached PDF for a synced document", async () => {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "t04-")), "a.pdf");
    fs.writeFileSync(f, "%PDF-1.4 test");
    repos().items.upsert(doc, "2026-01-01");
    repos().documentTexts.upsert({ clioId: "55", versionUuid: "v", pageCount: 2, pages: ["p1", "p2"], filePath: f }, "2026-01-01");
    const res = await getFile(new Request("http://x"), ctx2("55"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(await res.text()).toContain("%PDF");
  });
  it("source returns the record plus the requested page text", async () => {
    repos().items.upsert(doc, "2026-01-01");
    repos().documentTexts.upsert({ clioId: "55", versionUuid: "v", pageCount: 2, pages: ["p1", "p2"], filePath: "/x" }, "2026-01-01");
    const res = await getSource(new Request("http://x/api/source?drawerKey=document:55%23p2"));
    const body = await res.json();
    expect(body.documentText).toEqual({ page: 2, pageCount: 2, text: "p2" });
    expect((await getSource(new Request("http://x/api/source?drawerKey=bad"))).status).toBe(400);
    expect((await getSource(new Request("http://x/api/source?drawerKey=note:1"))).status).toBe(404);
  });
});
function ctx2(id: string) { return { params: Promise.resolve({ id }) }; }
