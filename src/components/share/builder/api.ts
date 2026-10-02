import type { Contact, Digest, ProviderView, ShareCandidate, ShareSummary, SharePreset } from "@/lib/types";

export interface CaseData { contacts: Contact[]; digest: Digest | null; shares: ShareSummary[] }
export interface DraftRequest { matterId: string; recipientLabel: string; recipientContactId?: string; preset?: SharePreset }
export interface DraftResponse { candidates: ShareCandidate[]; counts: { shared: number; withheld: number } }
export interface SendRequest { matterId: string; recipientLabel: string; recipientContactId?: string; includedIds: string[]; attorneyNote?: string; expiresInDays?: number }
/** Same body as SendRequest; nothing is persisted and no link is minted. */
export interface PreviewRequest { matterId: string; recipientLabel: string; recipientContactId?: string; includedIds: string[]; attorneyNote?: string; coverageLimits?: boolean }
export interface SendResponse { shareId: string; url: string; expiresAt: string }

export interface BuilderApi {
  loadCase(matterId: string): Promise<CaseData>;
  draft(req: DraftRequest): Promise<DraftResponse>;
  send(req: SendRequest): Promise<SendResponse>;
  preview(req: PreviewRequest): Promise<ProviderView>;
  listShares(matterId: string): Promise<ShareSummary[]>;
  revoke(shareId: string): Promise<void>;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return (await res.json()) as T;
}
const post = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export const httpApi: BuilderApi = {
  async loadCase(matterId) {
    const d = await json<Partial<CaseData>>(await fetch(`/api/case?matterId=${encodeURIComponent(matterId)}`));
    return { contacts: d.contacts ?? [], digest: d.digest ?? null, shares: d.shares ?? [] };
  },
  async draft(req) { return json(await post("/api/share/draft", req)); },
  async send(req) { return json(await post("/api/share", req)); },
  async preview(req) { return json(await post("/api/share/preview", req)); },
  async listShares(matterId) {
    return (await json<{ shares: ShareSummary[] }>(await fetch(`/api/share?matterId=${encodeURIComponent(matterId)}`))).shares;
  },
  async revoke(shareId) {
    const res = await post("/api/share/revoke", { shareId });
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
  },
};

export interface ProviderOption { contactId: string | null; name: string; role: string | null }

/** Providers from case contacts (roleKind 'provider'); falls back to the digest's provider bills. */
export function providerOptions(c: CaseData): ProviderOption[] {
  const out = c.contacts.filter((x) => x.roleKind === "provider")
    .map((x) => ({ contactId: x.clioId, name: x.name, role: x.role }));
  if (out.length) return out;
  return (c.digest?.providerBills ?? []).map((b) => ({ contactId: b.providerContactId, name: b.providerName, role: null }));
}
