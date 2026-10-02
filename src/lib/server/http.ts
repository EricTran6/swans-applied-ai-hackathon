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

/** Parse a JSON body with a zod schema. Returns the data or a 400 Response. */
export async function parseBody<T extends z.ZodType>(req: Request, schema: T): Promise<{ data: z.infer<T> } | { error: Response }> {
  let raw: unknown;
  try { raw = await req.json(); } catch { return { error: errorJson(400, "invalid JSON body") }; }
  const r = schema.safeParse(raw);
  if (!r.success) return { error: errorJson(400, "invalid request") };
  return { data: r.data };
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
