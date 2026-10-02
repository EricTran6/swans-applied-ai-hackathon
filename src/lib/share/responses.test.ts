import { describe, it, expect } from "vitest";
import type { ShareResponse } from "@/lib/types";
import { recordResponse, validateResponse } from "./index";

describe("provider replies", () => {
  it("accepts sent / will_send / note and persists through the injected store", () => {
    const stored: ShareResponse[] = [];
    const r = recordResponse("share-1", { needId: "task:100052", kind: "will_send", promisedDate: "2026-10-15", text: "Sending Friday" }, (x) => stored.push(x), new Date("2026-10-02T00:00:00Z"));
    expect(stored).toEqual([r]);
    expect(r).toMatchObject({ shareId: "share-1", needId: "task:100052", kind: "will_send", promisedDate: "2026-10-15", text: "Sending Friday", createdAt: "2026-10-02T00:00:00.000Z" });
    expect(r.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(recordResponse("s", { kind: "sent" }, () => {}).needId).toBeNull();
  });
  it("rejects bad kind, long text, non-ISO dates, missing required fields and unknown keys", () => {
    expect(validateResponse({ kind: "done" }).ok).toBe(false);
    expect(validateResponse({ kind: "note", text: "x".repeat(1001) }).ok).toBe(false);
    expect(validateResponse({ kind: "note", text: "x".repeat(1000) }).ok).toBe(true);
    expect(validateResponse({ kind: "will_send", promisedDate: "10/15/2026" }).ok).toBe(false);
    expect(validateResponse({ kind: "will_send", promisedDate: "2026-02-30" }).ok).toBe(false);
    expect(validateResponse({ kind: "will_send" }).ok).toBe(false);
    expect(validateResponse({ kind: "note" }).ok).toBe(false);
    expect(validateResponse({ kind: "sent", evil: 1 }).ok).toBe(false);
    expect(validateResponse("nope").ok).toBe(false);
    expect(() => recordResponse("s", { kind: "bad" }, () => {})).toThrow(/kind/);
    expect(() => recordResponse("", { kind: "sent" }, () => {})).toThrow(/shareId/);
  });
});
