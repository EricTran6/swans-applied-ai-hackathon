import { beforeEach, describe, expect, it, vi } from "vitest";

const buildProviderView = vi.fn();
const latest = vi.fn();
vi.mock("@/lib/share", () => ({
  DEFAULT_PRESET: { allow: ["status", "requests"], optIn: ["other_records"] },
  buildCandidates: () => [
    { id: "status:alive", category: "status", included: true, hardDeny: false },
    { id: "task:1", category: "requests", included: true, hardDeny: false },
    { id: "kpi:case_value", category: "valuation", included: false, hardDeny: true },
    { id: "document:9", category: "liability", included: false, hardDeny: false },
  ],
  buildProviderView: (...args: unknown[]) => buildProviderView(...args),
}));
vi.mock("@/lib/db", () => ({
  repos: () => ({ digests: { latest }, items: { records: () => [] } }),
}));

import { POST } from "./route";

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://x/api/share/preview", {
    method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
  });
const good = { matterId: "m1", recipientLabel: "Jane's Clinic", recipientContactId: "c1", includedIds: ["task:1"] };

beforeEach(() => {
  buildProviderView.mockReset().mockReturnValue({ recipientLabel: "Jane's Clinic", needs: [] });
  latest.mockReset().mockReturnValue({ matterId: "m1", version: 1 });
});

describe("POST /api/share/preview", () => {
  it("rejects a bad body with 400 and builds nothing", async () => {
    for (const bad of [{}, { ...good, includedIds: "task:1" }, { ...good, matterId: "" }, { ...good, attorneyNote: "x".repeat(1001) },
      { ...good, coverageLimits: "yes" }]) {
      const res = await POST(post(bad));
      expect(res.status).toBe(400);
    }
    expect(buildProviderView).not.toHaveBeenCalled();
  });

  it("rejects a non-JSON content type and a foreign origin", async () => {
    const res = await POST(new Request("http://x", { method: "POST", headers: { "content-type": "text/plain" }, body: "{}" }));
    expect(res.status).toBe(415);
    expect((await POST(post(good, { origin: "https://evil.example" }))).status).toBe(403);
  });

  it("returns 409 when the matter has no digest", async () => {
    latest.mockReturnValue(null);
    expect((await POST(post(good))).status).toBe(409);
  });

  it("returns the view from the share lib with no-store and no token", async () => {
    const res = await POST(post({ ...good, attorneyNote: "  Hello  ", coverageLimits: true }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toEqual({ recipientLabel: "Jane's Clinic", needs: [] });
    expect(JSON.stringify(body)).not.toMatch(/token|url/i);
    const [, , ids, recipient, note] = buildProviderView.mock.calls[0];
    expect(ids).toEqual(["task:1", "coverage:limits"]);
    expect(recipient).toEqual({ label: "Jane's Clinic", contactId: "c1" });
    expect(note).toBe("Hello");
  });

  it("fails closed: drops hard-deny, non-preset and unknown ids", async () => {
    await POST(post({ ...good, includedIds: ["task:1", "task:1", "kpi:case_value", "document:9", "bogus:1"] }));
    expect(buildProviderView.mock.calls[0][2]).toEqual(["task:1"]);
  });
});
