import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { buildRespondBody, postRespond, postView, fmtDate, stageIndex } from "./logic";
import type { ProviderView } from "@/lib/types";

const view = JSON.parse(readFileSync("fixtures/sample-provider-view.json", "utf8")) as ProviderView;

describe("reply posting", () => {
  it("builds the right body", () => {
    expect(buildRespondBody({ needId: "n1", kind: "sent" })).toEqual({ needId: "n1", kind: "sent" });
    expect(buildRespondBody({ needId: "n1", kind: "will_send", promisedDate: "2026-10-20" })).toEqual({ needId: "n1", kind: "will_send", promisedDate: "2026-10-20" });
    expect(buildRespondBody({ kind: "note", text: "  hi  " })).toEqual({ kind: "note", text: "hi" });
  });
  it("POSTs JSON to /respond", async () => {
    const f = vi.fn().mockResolvedValue({ ok: true });
    const ok = await postRespond("tok", { needId: "n1", kind: "sent" }, f);
    expect(ok).toBe(true);
    expect(f).toHaveBeenCalledWith("/api/share/tok/respond", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ needId: "n1", kind: "sent" }),
    });
  });
  it("returns false on failure", async () => {
    expect(await postRespond("t", { kind: "note", text: "x" }, vi.fn().mockRejectedValue(new Error("x")))).toBe(false);
  });
  it("view beacon posts to /view", async () => {
    const f = vi.fn().mockResolvedValue({ ok: true });
    await postView("tok", f);
    expect(f).toHaveBeenCalledWith("/api/share/tok/view", { method: "POST" });
  });
});

describe("fixture", () => {
  it("has a needs item the reply buttons can target", () => {
    const n = view.needs[0];
    expect(buildRespondBody({ needId: n.id, kind: "sent" }).needId).toBe(n.id);
  });
});

describe("helpers", () => {
  it("formats dates in UTC", () => expect(fmtDate("2026-09-28")).toBe("Sep 28, 2026"));
  it("indexes stages", () => expect(stageIndex("In litigation")).toBe(2));
});
