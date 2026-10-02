import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { hostnameOf, isLoopbackRequest, isPublicPath, middleware } from "./middleware";

const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde";
const req = (path: string, host: string, method = "GET", extra: Record<string, string> = {}) =>
  new NextRequest(`http://${host}${path}`, { method, headers: { host, ...extra } });

describe("middleware network gate", () => {
  it("parses hostnames with ports and IPv6 brackets", () => {
    expect(hostnameOf("127.0.0.1:3000")).toBe("127.0.0.1");
    expect(hostnameOf("[::1]:3000")).toBe("::1");
    expect(hostnameOf("LOCALHOST")).toBe("localhost");
    expect(hostnameOf("::1")).toBe("::1");
  });
  it("treats loopback hosts as loopback unless a forwarded host is public", () => {
    expect(isLoopbackRequest(new Headers({ host: "localhost:3000" }))).toBe(true);
    expect(isLoopbackRequest(new Headers({ host: "[::1]:3000" }))).toBe(true);
    expect(isLoopbackRequest(new Headers({ host: "attacker.example" }))).toBe(false);
    expect(isLoopbackRequest(new Headers({ host: "127.0.0.1:3000", "x-forwarded-host": "abc.ngrok.app" }))).toBe(false);
    expect(isLoopbackRequest(new Headers({}))).toBe(false);
  });
  it("allows only the share surface and static assets publicly", () => {
    expect(isPublicPath("GET", `/s/${TOKEN}`)).toBe(true);
    expect(isPublicPath("GET", `/api/share/${TOKEN}`)).toBe(true);
    expect(isPublicPath("POST", `/api/share/${TOKEN}`)).toBe(false);
    expect(isPublicPath("POST", `/api/share/${TOKEN}/view`)).toBe(true);
    expect(isPublicPath("POST", `/api/share/${TOKEN}/respond`)).toBe(true);
    expect(isPublicPath("GET", "/_next/static/chunk.js")).toBe(true);
    expect(isPublicPath("GET", "/favicon.ico")).toBe(true);
    for (const p of ["/", "/api/matters", "/api/share/draft", "/api/share/revoke", "/api/share", "/matters/1", "/dev/brief", "/api/case"]) {
      expect(isPublicPath("GET", p)).toBe(false);
      expect(isPublicPath("POST", p)).toBe(false);
    }
  });
  it("404s attorney routes for a public Host and passes them for loopback", () => {
    expect(middleware(req("/api/matters", "attacker.example")).status).toBe(404);
    expect(middleware(req("/", "attacker.example")).status).toBe(404);
    expect(middleware(req("/api/share", "attacker.example", "POST")).status).toBe(404);
    expect(middleware(req("/api/matters", "127.0.0.1:3000")).headers.get("x-middleware-next")).toBe("1");
    expect(middleware(req(`/api/share/${TOKEN}`, "attacker.example")).headers.get("x-middleware-next")).toBe("1");
  });
  it("adds anti-framing headers on share pages", () => {
    for (const host of ["share.example", "127.0.0.1:3000"]) {
      const res = middleware(req(`/s/${TOKEN}`, host));
      expect(res.headers.get("X-Frame-Options")).toBe("DENY");
      expect(res.headers.get("Content-Security-Policy")).toBe("frame-ancestors 'none'");
    }
  });
});
