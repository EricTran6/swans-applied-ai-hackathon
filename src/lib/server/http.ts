// Request/response helpers shared by route handlers. Never log record text, tokens or IPs.
import { createHash, randomBytes } from "node:crypto";
import type { z } from "zod";

export const VIEWER_COOKIE = "viewer";

export function json(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}
export function errorJson(status: number, message: string, headers?: Record<string, string>): Response {
  return json({ error: message }, status, headers);
}
export function noContent(headers?: Record<string, string>): Response { return new Response(null, { status: 204, headers }); }

export const MAX_BODY_BYTES = 64 * 1024;       // attorney routes
export const MAX_SHARE_BODY_BYTES = 8 * 1024;  // public provider routes (/api/share/<token>/view|respond)

/** Read the body as text, refusing more than `max` bytes (Content-Length checked first, then streamed). */
export async function readCappedText(req: Request, max: number): Promise<string | null> {
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > max) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { await reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
  return new TextDecoder().decode(buf);
}

export function isJsonContentType(req: Request): boolean {
  return /^application\/json\s*(;|$)/i.test((req.headers.get("content-type") ?? "").trim());
}

/**
 * Parse a JSON body with a zod schema. Requires Content-Type application/json (415) and caps the body
 * size (413). Returns the data or an error Response.
 */
export async function parseBody<T extends z.ZodType>(req: Request, schema: T,
  opts: { maxBytes?: number; headers?: Record<string, string> } = {}): Promise<{ data: z.infer<T> } | { error: Response }> {
  if (!isJsonContentType(req)) return { error: errorJson(415, "content-type must be application/json", opts.headers) };
  const text = await readCappedText(req, opts.maxBytes ?? MAX_BODY_BYTES);
  if (text === null) return { error: errorJson(413, "body too large", opts.headers) };
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { error: errorJson(400, "invalid JSON body", opts.headers) }; }
  const r = schema.safeParse(raw);
  if (!r.success) return { error: errorJson(400, "invalid request", opts.headers) };
  return { data: r.data };
}

const LOOPBACK_ORIGIN_HOSTS = ["127.0.0.1", "localhost", "[::1]"];

/** Origins allowed to call attorney mutation routes: APP_BASE_URL, or a loopback origin on its port. */
export function isAllowedOrigin(origin: string): boolean {
  let base: URL; let o: URL;
  try { base = new URL(process.env.APP_BASE_URL || "http://127.0.0.1:3000"); o = new URL(origin); } catch { return false; }
  if (o.origin === base.origin) return true;
  return o.protocol === "http:" && LOOPBACK_ORIGIN_HOSTS.includes(o.hostname) && o.port === base.port;
}

/** CSRF guard + JSON parse for attorney mutation routes: a present Origin must be allowed (else 403). */
export async function parseAttorneyBody<T extends z.ZodType>(req: Request, schema: T): Promise<{ data: z.infer<T> } | { error: Response }> {
  const origin = req.headers.get("origin");
  if (origin !== null && !isAllowedOrigin(origin)) return { error: errorJson(403, "forbidden") };
  return parseBody(req, schema);
}

/** Log an error without any payload: name only. */
export function logError(where: string, err: unknown): void {
  console.error(`[${where}] ${err instanceof Error ? err.name : "error"}`);
}

export const SHARE_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex",
};

// ---- viewer cookie (attorney "since last open" identity) ----
export function readViewerId(req: Request): string | null {
  const m = /(?:^|;\s*)viewer=([A-Za-z0-9_-]{16,64})/.exec(req.headers.get("cookie") ?? "");
  return m ? m[1] : null;
}
/** Existing viewer id, or a fresh one (isNew = true; caller must attach the cookie). */
export function ensureViewerId(req: Request): { id: string; isNew: boolean } {
  const existing = readViewerId(req);
  return existing ? { id: existing, isNew: false } : { id: randomBytes(24).toString("base64url"), isNew: true };
}
export function viewerCookieHeader(id: string): string {
  return `${VIEWER_COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}`;
}
export function withViewerCookie(res: Response, v: { id: string; isNew: boolean }): Response {
  if (v.isNew) res.headers.append("Set-Cookie", viewerCookieHeader(v.id));
  return res;
}

/** sha256(salt + ip), never the raw IP. */
export function hashIp(req: Request): string | null {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip");
  if (!ip) return null;
  return createHash("sha256").update((process.env.SHARE_IP_SALT ?? "") + ip).digest("hex");
}
