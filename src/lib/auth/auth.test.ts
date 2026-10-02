import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const store: { row?: Record<string, unknown> } = {};
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    prepare: (sql: string) => ({
      run: (access: string, refresh: string | null, expires: string | null, updated: string) => {
        store.row = { access_token: access, refresh_token: refresh, expires_at: expires, updated_at: updated };
      },
      get: () => (sql.startsWith("SELECT") ? store.row : undefined),
    }),
  }),
}));

import { exchangeCode, getClioAccessToken, clioAuthorizeUrl } from "./index";

const fetchMock = vi.fn();
beforeEach(() => {
  store.row = undefined;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("CLIO_CLIENT_ID", "cid");
  vi.stubEnv("CLIO_CLIENT_SECRET", "sec");
  vi.stubEnv("CLIO_BASE_URL", "https://clio.test");
  vi.stubEnv("CLIO_ACCESS_TOKEN", "");
});
afterEach(() => vi.unstubAllEnvs());

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

describe("auth", () => {
  it("builds authorize url", () => {
    const u = new URL(clioAuthorizeUrl("st"));
    expect(u.origin + u.pathname).toBe("https://clio.test/oauth/authorize");
    expect(u.searchParams.get("state")).toBe("st");
    expect(u.searchParams.get("client_id")).toBe("cid");
    expect(u.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:3000/api/auth/clio/callback");
  });

  it("exchangeCode stores row", async () => {
    fetchMock.mockResolvedValue(ok({ access_token: "a1", refresh_token: "r1", expires_in: 3600 }));
    await exchangeCode("code");
    expect(fetchMock.mock.calls[0][0]).toBe("https://clio.test/oauth/token");
    expect(String(fetchMock.mock.calls[0][1].body)).toContain("grant_type=authorization_code");
    expect(store.row).toMatchObject({ access_token: "a1", refresh_token: "r1" });
    expect(await getClioAccessToken()).toBe("a1");
  });

  it("refreshes an expired token", async () => {
    store.row = { access_token: "old", refresh_token: "r1", expires_at: new Date(Date.now() - 1000).toISOString() };
    fetchMock.mockResolvedValue(ok({ access_token: "new", expires_in: 3600 }));
    expect(await getClioAccessToken()).toBe("new");
    expect(String(fetchMock.mock.calls[0][1].body)).toContain("grant_type=refresh_token");
    expect(store.row).toMatchObject({ access_token: "new", refresh_token: "r1" });
  });

  it("falls back to env token", async () => {
    vi.stubEnv("CLIO_ACCESS_TOKEN", "envtok");
    expect(await getClioAccessToken()).toBe("envtok");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null with nothing configured", async () => {
    expect(await getClioAccessToken()).toBeNull();
  });
});
