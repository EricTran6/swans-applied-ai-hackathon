import type { ProviderView } from "@/lib/types";

export const STAGES: ProviderView["stage"]["label"][] = [
  "Treating",
  "Pre-suit negotiation",
  "In litigation",
  "Settled / paying liens",
  "Closed",
];

export type RespondBody = {
  needId?: string;
  kind: "sent" | "will_send" | "note";
  promisedDate?: string;
  text?: string;
};

/** "2026-09-28" or ISO timestamp -> "Sep 28, 2026" (UTC, so server and client agree). */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function stageIndex(label: ProviderView["stage"]["label"]): number {
  return Math.max(0, STAGES.indexOf(label));
}

export function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function buildRespondBody(input: {
  needId?: string | null;
  kind: RespondBody["kind"];
  promisedDate?: string | null;
  text?: string | null;
}): RespondBody {
  const body: RespondBody = { kind: input.kind };
  if (input.needId) body.needId = input.needId;
  if (input.kind === "will_send" && input.promisedDate) body.promisedDate = input.promisedDate;
  const text = input.text?.trim();
  if (text) body.text = text;
  return body;
}

type FetchLike = (url: string, init: { method: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean }>;

export async function postRespond(token: string, body: RespondBody, fetchImpl: FetchLike = fetch as FetchLike): Promise<boolean> {
  try {
    const res = await fetchImpl(`/api/share/${encodeURIComponent(token)}/respond`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function postView(token: string, fetchImpl: FetchLike = fetch as FetchLike): Promise<void> {
  try {
    await fetchImpl(`/api/share/${encodeURIComponent(token)}/view`, { method: "POST" });
  } catch {
    /* beacon is best-effort */
  }
}
