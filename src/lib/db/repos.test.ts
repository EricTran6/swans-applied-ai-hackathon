import { beforeEach, describe, expect, it } from "vitest";
import { createRepos, openDb, type Repos } from "./index";
import type { ClioRecord, Digest } from "@/lib/types";

let r: Repos;
beforeEach(() => { r = createRepos(openDb(":memory:")); });

const note = (id: string, hash = "h1"): ClioRecord => ({
  sourceType: "note", clioId: id, matterId: "m1", createdAt: "", updatedAt: "", sourceDate: null, title: "t", bodyText: "x",
  drawerKey: `note:${id}`, etag: null, contentHash: hash, subject: "s", date: null, author: null,
});

describe("repos", () => {
  it("upserts items, keeps first_seen, hides deleted", () => {
    r.items.upsert(note("1"), "2026-01-01");
    r.items.upsert(note("1", "h2"), "2026-01-02");
    const row = r.items.get("note", "1")!;
    expect(row.firstSeenAt).toBe("2026-01-01");
    expect(row.contentHash).toBe("h2");
    r.items.markDeleted("note", "1", "2026-01-03");
    expect(r.items.records("m1")).toHaveLength(0);
    expect(r.items.listByMatter("m1", true)).toHaveLength(1);
  });
  it("lists events after a timestamp as ChangeEntry", () => {
    const e = { matterId: "m1", sourceType: "note" as const, clioId: "1", kind: "new" as const, contentHash: "a", prevHash: null, title: "T", sourceDate: null };
    r.events.insert({ ...e, detectedAt: "2026-01-01T00:00:00Z" });
    r.events.insert({ ...e, clioId: "2", detectedAt: "2026-01-05T00:00:00Z" });
    const out = r.events.listAfter("m1", "2026-01-02T00:00:00Z");
    expect(out.map((x) => x.drawerKey)).toEqual(["note:2"]);
  });
  it("versions digests per matter", () => {
    const d = { matterId: "m1", inputSetHash: "x", createdAt: "2026-01-01" } as Omit<Digest, "version">;
    expect(r.digests.insert(d, "v1", 0.5).version).toBe(1);
    expect(r.digests.insert(d, "v1", 0.25).version).toBe(2);
    expect(r.digests.latest("m1")!.version).toBe(2);
    expect(r.digests.totalCostUsd("m1")).toBeCloseTo(0.75);
  });
  it("extraction cache round-trips", () => {
    const k = { sourceType: "note" as const, clioId: "1", contentHash: "h", extractorVersion: "v1" };
    expect(r.extractions.get(k)).toBeNull();
    r.extractions.set(k, { a: 1 });
    expect(r.extractions.asCache().get(k)).toEqual({ a: 1 });
  });
  it("tracks shares, views, revoke and view state", () => {
    r.shares.insert({ id: "s1", matterId: "m1", tokenHash: "th", recipientLabel: "P", recipientContactId: null, presetJson: "{}",
      includedIdsJson: "[]", payloadJson: "{}", attorneyNote: null, sharedCount: 1, withheldCount: 2, digestVersion: 1,
      createdAt: "2026-01-01", expiresAt: "2026-01-08", revokedAt: null });
    expect(r.shares.getByTokenHash("th")!.id).toBe("s1");
    r.shareViews.insert("s1", "2026-01-02", null, null);
    r.shareViews.insert("s1", "2026-01-03", null, null);
    expect(r.shareViews.stats("s1")).toEqual({ views: 2, firstViewedAt: "2026-01-02", lastViewedAt: "2026-01-03" });
    expect(r.shares.revoke("s1", "2026-01-04")).toBe(true);
    expect(r.shares.revoke("s1", "2026-01-05")).toBe(false);
    r.viewState.upsert("v", "m1", "2026-01-01", 1);
    r.viewState.upsert("v", "m1", "2026-01-02", 2);
    expect(r.viewState.get("v", "m1")).toMatchObject({ lastOpenedAt: "2026-01-02", lastDigestVersion: 2 });
  });
});
