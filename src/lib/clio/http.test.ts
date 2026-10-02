import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _setSleepForTests, buildClioUrl, clioFetch, clioGet, dropInvalidFields, splitFields } from "./http";

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

describe("clio http client", () => {
  const fetchMock = vi.fn();
  const sleeps: number[] = [];
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("CLIO_BASE_URL", "https://app.clio.example");
    vi.stubEnv("CLIO_ACCESS_TOKEN", "test-token");
    _setSleepForTests(async (ms) => { sleeps.push(ms); });
  });
  afterEach(() => {
    fetchMock.mockReset();
    sleeps.length = 0;
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    _setSleepForTests(null);
  });

  it("refuses any non-GET method and never hits the network", async () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "post"]) {
      await expect(clioFetch("https://app.clio.example/api/v4/notes.json", { method })).rejects.toThrow(/read-only/);
    }
    await expect(clioFetch("https://app.clio.example/api/v4/notes.json", { body: "{}" })).rejects.toThrow(/read-only/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("appends /api/v4 and sends a GET with the bearer token", async () => {
    fetchMock.mockResolvedValueOnce(json({ data: [{ id: 1 }] }));
    const out = await clioGet<{ id: number }>("notes.json", { matter_id: "5", fields: "id,matter{id}" });
    expect(out).toEqual([{ id: 1 }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://app.clio.example/api/v4/notes.json?matter_id=5&fields=id,matter{id}&limit=200");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe("Bearer test-token");
  });

  it("follows meta.paging.next", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ data: [{ id: 1 }], meta: { paging: { next: "https://app.clio.example/api/v4/notes.json?page_token=x" } } }))
      .mockResolvedValueOnce(json({ data: [{ id: 2 }], meta: { paging: {} } }));
    const out = await clioGet<{ id: number }>("notes.json", {});
    expect(out.map((o) => o.id)).toEqual([1, 2]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns a single resource as a 1-element array without limit", async () => {
    fetchMock.mockResolvedValueOnce(json({ data: { id: 7 } }));
    expect(await clioGet("matters/7.json", {})).toEqual([{ id: 7 }]);
    expect(fetchMock.mock.calls[0][0]).not.toContain("limit=");
  });

  it("honors Retry-After on 429 and backs off when the rate limit is low", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("", { status: 429, headers: { "Retry-After": "3" } }))
      .mockResolvedValueOnce(json({ data: [] }, 200, { "X-RateLimit-Remaining": "1" }));
    await clioGet("notes.json", {});
    expect(sleeps[0]).toBe(4000);
    expect(sleeps.length).toBe(2);
  });

  it("drops fields Clio rejects with a 400 and retries", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ error: { message: "photo, image is not a valid field" } }, 400))
      .mockResolvedValueOnce(json({ data: [{ id: 1 }] }));
    await clioGet("contacts.json", { fields: "id,photo,image,name" });
    expect(fetchMock.mock.calls[1][0]).toContain("fields=id,name&");
  });

  it("never sends credentials to a foreign host", async () => {
    await expect(clioFetch("https://evil.example/api/v4/notes.json")).rejects.toThrow(/foreign host/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("limits to 2 requests in flight", async () => {
    let active = 0; let peak = 0;
    fetchMock.mockImplementation(async () => {
      active++; peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return json({ data: [] });
    });
    await Promise.all([1, 2, 3, 4, 5].map(() => clioGet("notes.json", {})));
    expect(peak).toBe(2);
  });

  it("helpers: field splitting and nested drop", () => {
    expect(splitFields("a,b{c,d},e")).toEqual(["a", "b{c,d}", "e"]);
    expect(dropInvalidFields(["id", "company{id,name}"], "company{name} is not a valid field")).toEqual(["id", "company{id}"]);
    expect(dropInvalidFields(["id"], "something else")).toBeNull();
    expect(buildClioUrl("/x.json", {})).toBe("https://app.clio.example/api/v4/x.json");
  });
});
