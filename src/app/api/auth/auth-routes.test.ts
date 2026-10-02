import { describe, it, expect, vi, beforeEach } from "vitest";

const exchangeCode = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<typeof import("@/lib/auth")>()), exchangeCode }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));

import { NextRequest } from "next/server";
import { GET as start } from "./clio/start/route";
import { GET as callback } from "./clio/callback/route";

beforeEach(() => {
  exchangeCode.mockReset();
  vi.stubEnv("CLIO_CLIENT_ID", "cid");
  vi.stubEnv("CLIO_CLIENT_SECRET", "sec");
});

const req = (qs: string, cookie?: string) =>
  new NextRequest(`http://127.0.0.1:3000/api/auth/clio/callback?${qs}`, {
    headers: cookie ? { cookie: `clio_oauth_state=${cookie}` } : {},
  });

describe("oauth routes", () => {
  it("start sets httpOnly state cookie and redirects", async () => {
    const res = await start();
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get("location")!);
    const state = loc.searchParams.get("state")!;
    const setCookie = res.headers.get("set-cookie")!;
    expect(setCookie).toContain(`clio_oauth_state=${state}`);
    expect(setCookie.toLowerCase()).toContain("httponly");
  });

  it("callback rejects state mismatch with 400", async () => {
    const res = await callback(req("code=c&state=bad", "good"));
    expect(res.status).toBe(400);
    expect(exchangeCode).not.toHaveBeenCalled();
  });

  it("callback rejects missing cookie", async () => {
    expect((await callback(req("code=c&state=x"))).status).toBe(400);
  });

  it("callback exchanges code and redirects home", async () => {
    exchangeCode.mockResolvedValue(undefined);
    const res = await callback(req("code=c&state=s1", "s1"));
    expect(exchangeCode).toHaveBeenCalledWith("c");
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/");
  });
});
