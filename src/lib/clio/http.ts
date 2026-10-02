// GET-only Clio HTTP client. The ONLY network primitive in this module is clioFetch(), which
// refuses any method other than GET. Follows meta.paging.next, max 2 requests in flight,
// honors Retry-After on 429 and backs off when X-RateLimit-Remaining <= 2.
import { getClioAccessToken } from "@/lib/auth";

const MAX_IN_FLIGHT = 2;
const MAX_TRIES = 6;
const PAGE_LIMIT = "200";

type SleepFn = (ms: number) => Promise<void>;
let sleep: SleepFn = (ms) => new Promise((r) => setTimeout(r, ms));
/** Test hook: replace the sleep used for rate-limit backoff. */
export function _setSleepForTests(fn: SleepFn | null): void {
  sleep = fn ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
}

export function clioApiBase(): string {
  const raw = (process.env.CLIO_BASE_URL || "https://app.clio.com").replace(/\/+$/, "");
  return raw.endsWith("/api/v4") ? raw : `${raw}/api/v4`;
}

export function clioAppBase(): string {
  return clioApiBase().replace(/\/api\/v4$/, "");
}

export function clioMatterUrl(matterId: string): string {
  return `${clioAppBase()}/nc/#/matters/${encodeURIComponent(matterId)}`;
}

async function accessToken(): Promise<string> {
  let token: string | null = null;
  try {
    token = await getClioAccessToken();
  } catch {
    token = null; // auth module not wired yet: fall back to env
  }
  token = token || process.env.CLIO_ACCESS_TOKEN || null;
  if (!token) throw new Error("Clio access token missing (connect Clio or set CLIO_ACCESS_TOKEN)");
  return token;
}

// ---------- concurrency limiter ----------
let inFlight = 0;
const waiters: (() => void)[] = [];
async function acquire(): Promise<void> {
  if (inFlight < MAX_IN_FLIGHT) {
    inFlight++;
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  inFlight++;
}
function release(): void {
  inFlight--;
  const next = waiters.shift();
  if (next) next();
}

export interface ClioFetchInit {
  method?: string;
  auth?: boolean; // default true; false for signed storage URLs
  redirect?: "manual" | "follow" | "error";
  body?: unknown;
}

/**
 * The single network primitive. Throws on anything but GET (and on any request body).
 * Auth is only ever sent to the configured Clio API host.
 */
export async function clioFetch(url: string, init: ClioFetchInit = {}): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  if (method !== "GET") throw new Error(`Clio is read-only: refusing ${method} ${redactUrl(url)}`);
  if (init.body !== undefined) throw new Error("Clio is read-only: GET requests carry no body");
  const auth = init.auth ?? true;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (auth) {
    if (new URL(url).host !== new URL(clioApiBase()).host) {
      throw new Error("refusing to send Clio credentials to a foreign host");
    }
    headers.Authorization = `Bearer ${await accessToken()}`;
  }
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    await acquire();
    let res: Response;
    try {
      res = await fetch(url, { method: "GET", headers, redirect: init.redirect ?? "manual" });
    } finally {
      release();
    }
    if (res.status === 429) {
      const wait = Number(res.headers.get("Retry-After")) || 30;
      await sleep((wait + 1) * 1000);
      continue;
    }
    const remaining = res.headers.get("X-RateLimit-Remaining");
    if (auth && remaining !== null && Number(remaining) <= 2) {
      const reset = Number(res.headers.get("X-RateLimit-Reset"));
      const secs = reset ? Math.max(1, reset - Math.floor(Date.now() / 1000) + 1) : 60;
      await sleep(Math.min(secs, 65) * 1000);
    }
    return res;
  }
  throw new Error("Clio rate limit: too many 429 responses");
}

function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return "(invalid url)";
  }
}

export function buildClioUrl(path: string, params: Record<string, string>): string {
  const q = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&")
    .replace(/%7B/gi, "{")
    .replace(/%7D/gi, "}")
    .replace(/%2C/gi, ",");
  const p = path.replace(/^\/+/, "");
  return `${clioApiBase()}/${p}${q ? `?${q}` : ""}`;
}

/** Drop fields Clio rejected with a 400 ("x, y{z} is not a valid field"). Returns null if nothing changed. */
export function dropInvalidFields(fields: string[], message: string): string[] | null {
  const head = message.split(/\s+(?:is not a valid field|are not valid fields)/)[0];
  if (head === message) return null;
  let changed = false;
  let out = [...fields];
  for (const rawBad of head.split(",").map((s) => s.trim()).filter(Boolean)) {
    const nested = /^(\w+)\{(\w+)\}$/.exec(rawBad);
    if (nested) {
      out = out.map((f) => {
        if (!f.startsWith(`${nested[1]}{`)) return f;
        const inner = f.slice(nested[1].length + 1, -1).split(",").filter((x) => x !== nested[2]);
        changed = true;
        return `${nested[1]}{${inner.join(",")}}`;
      });
      continue;
    }
    const key = rawBad.replace(/\{\}$/, "").replace(/\}+$/, "");
    const before = out.length;
    out = out.filter((f) => f.split("{")[0] !== key);
    if (out.length !== before) changed = true;
  }
  return changed ? out : null;
}

interface ClioPage<T> {
  data: T[] | T;
  meta?: { paging?: { next?: string } };
}

/**
 * GET a Clio collection (or single resource, returned as a 1-element array).
 * `params.fields` is a comma list; invalid fields reported by a 400 are dropped and retried.
 * Collections get limit=200 and follow meta.paging.next.
 */
export async function clioGet<T>(path: string, params: Record<string, string>): Promise<T[]> {
  const single = /\/\d+\.json$/.test(path);
  let fields = params.fields ? splitFields(params.fields) : null;
  let body: ClioPage<T> | null = null;
  for (let i = 0; i < 20 && body === null; i++) {
    const query: Record<string, string> = { ...params };
    if (fields) query.fields = fields.join(",");
    if (!single && !query.limit) query.limit = PAGE_LIMIT;
    const res = await clioFetch(buildClioUrl(path, query));
    if (res.status === 200) {
      body = (await res.json()) as ClioPage<T>;
      break;
    }
    const text = await res.text().catch(() => "");
    if (res.status === 400 && fields) {
      let msg = text;
      try {
        msg = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? text;
      } catch {
        /* keep raw text */
      }
      const next = dropInvalidFields(fields, msg);
      if (next) {
        fields = next;
        continue;
      }
    }
    throw new Error(`Clio GET ${path} failed: HTTP ${res.status}`);
  }
  if (!body) throw new Error(`Clio GET ${path} failed: field negotiation did not converge`);
  if (!Array.isArray(body.data)) return [body.data];
  const out: T[] = [...body.data];
  let next = body.meta?.paging?.next;
  while (next) {
    const res = await clioFetch(next);
    if (res.status !== 200) throw new Error(`Clio GET ${path} paging failed: HTTP ${res.status}`);
    const page = (await res.json()) as ClioPage<T>;
    if (Array.isArray(page.data)) out.push(...page.data);
    next = page.meta?.paging?.next;
  }
  return out;
}

/** Split "a,b{c,d},e" on top-level commas only. */
export function splitFields(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (ch === "," && depth === 0) {
      if (cur) out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
