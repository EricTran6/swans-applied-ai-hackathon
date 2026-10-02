// Network gate. The attorney dashboard has no login: it is only for loopback. Any request whose Host
// (or X-Forwarded-Host) is not loopback, e.g. via a tunnel exposing share links, may reach only the
// provider share surface and static assets; everything else is a 404.
import { NextResponse, type NextRequest } from "next/server";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const SHARE_TOKEN = "[A-Za-z0-9_-]{16,200}";
const SHARE_GET_RE = new RegExp(`^/api/share/${SHARE_TOKEN}$`);
const SHARE_POST_RE = new RegExp(`^/api/share/${SHARE_TOKEN}/(view|respond)$`);
const STATIC_ASSET_RE = /^\/[\w.-]+\.(ico|png|svg|jpe?g|webp|gif|txt|webmanifest|woff2?)$/i;

export const SHARE_PAGE_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "frame-ancestors 'none'",
};

/** "127.0.0.1:3000" | "[::1]:3000" | "localhost" -> hostname without port/brackets, lowercased. */
export function hostnameOf(hostHeader: string): string {
  const h = hostHeader.trim().toLowerCase();
  if (h.startsWith("[")) return h.slice(1, h.indexOf("]") > 0 ? h.indexOf("]") : undefined);
  const colons = h.split(":").length - 1;
  return colons === 1 ? h.slice(0, h.indexOf(":")) : h; // bare IPv6 (>1 colon) has no port
}

export function isLoopbackRequest(headers: Headers): boolean {
  const host = headers.get("host");
  if (!host || !LOOPBACK_HOSTS.has(hostnameOf(host))) return false;
  const fwd = headers.get("x-forwarded-host");
  return !fwd || fwd.split(",").every((h) => LOOPBACK_HOSTS.has(hostnameOf(h)));
}

/** Paths a non-loopback (public) client may reach. */
export function isPublicPath(method: string, pathname: string): boolean {
  if (pathname.startsWith("/_next/") || STATIC_ASSET_RE.test(pathname)) return true;
  if (pathname.startsWith("/s/")) return true;
  if (SHARE_GET_RE.test(pathname)) return method === "GET" || method === "HEAD";
  if (SHARE_POST_RE.test(pathname)) return method === "POST";
  return false;
}

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  if (!isLoopbackRequest(req.headers) && !isPublicPath(req.method, pathname)) {
    return new NextResponse("Not found", { status: 404, headers: { "Content-Type": "text/plain" } });
  }
  const res = NextResponse.next();
  if (pathname.startsWith("/s/")) for (const [k, v] of Object.entries(SHARE_PAGE_HEADERS)) res.headers.set(k, v);
  return res;
}
