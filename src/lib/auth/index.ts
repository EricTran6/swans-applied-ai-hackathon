// Clio OAuth token source: DB oauth_tokens row (refreshed when expired), else CLIO_ACCESS_TOKEN env.
// Only POSTs to the OAuth token endpoint (not a Clio data write). Tokens are never logged.
import { getDb } from "@/lib/db";

const DEFAULT_REDIRECT = "http://127.0.0.1:3000/api/auth/clio/callback";

interface TokenRow {
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
}

function baseUrl(): string {
  return (process.env.CLIO_BASE_URL || "https://app.clio.com").replace(/\/+$/, "");
}
export function redirectUri(): string {
  return process.env.CLIO_REDIRECT_URI || DEFAULT_REDIRECT;
}
export function oauthConfigured(): boolean {
  return Boolean(process.env.CLIO_CLIENT_ID && process.env.CLIO_CLIENT_SECRET);
}

export function clioAuthorizeUrl(state: string): string {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: process.env.CLIO_CLIENT_ID ?? "",
    redirect_uri: redirectUri(),
    state,
  });
  return `${baseUrl()}/oauth/authorize?${q.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

async function postToken(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${baseUrl()}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: process.env.CLIO_CLIENT_ID ?? "",
      client_secret: process.env.CLIO_CLIENT_SECRET ?? "",
      ...params,
    }).toString(),
  });
  if (!res.ok) throw new Error(`Clio token endpoint returned ${res.status}`);
  const json = (await res.json()) as TokenResponse;
  if (!json.access_token) throw new Error("Clio token response missing access_token");
  return json;
}

function storeTokens(t: TokenResponse, prevRefresh?: string | null): void {
  const now = Date.now();
  const expiresAt = t.expires_in ? new Date(now + t.expires_in * 1000).toISOString() : null;
  getDb()
    .prepare(
      `INSERT INTO oauth_tokens (id, access_token, refresh_token, expires_at, updated_at)
       VALUES (1, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET access_token = excluded.access_token,
         refresh_token = excluded.refresh_token, expires_at = excluded.expires_at,
         updated_at = excluded.updated_at`,
    )
    .run(t.access_token, t.refresh_token ?? prevRefresh ?? null, expiresAt, new Date(now).toISOString());
}

export async function exchangeCode(code: string): Promise<void> {
  const t = await postToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
  });
  storeTokens(t);
}

function readRow(): TokenRow | undefined {
  return getDb()
    .prepare("SELECT access_token, refresh_token, expires_at FROM oauth_tokens WHERE id = 1")
    .get() as TokenRow | undefined;
}

export async function getClioAccessToken(): Promise<string | null> {
  const row = readRow();
  if (row) {
    const expired = row.expires_at !== null && new Date(row.expires_at).getTime() <= Date.now();
    if (!expired) return row.access_token;
    if (row.refresh_token) {
      try {
        const t = await postToken({ grant_type: "refresh_token", refresh_token: row.refresh_token });
        storeTokens(t, row.refresh_token);
        return t.access_token;
      } catch {
        // fall through to env fallback
      }
    }
  }
  return process.env.CLIO_ACCESS_TOKEN || null;
}

export function connectionStatus(): { connected: boolean; source: "oauth" | "env" | "none"; expiresAt: string | null } {
  let row: TokenRow | undefined;
  try {
    row = readRow();
  } catch {
    row = undefined;
  }
  if (row) return { connected: true, source: "oauth", expiresAt: row.expires_at };
  if (process.env.CLIO_ACCESS_TOKEN) return { connected: true, source: "env", expiresAt: null };
  return { connected: false, source: "none", expiresAt: null };
}
