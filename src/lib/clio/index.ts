// GET-only Clio client (owner T01). Any non-GET throws (see clioFetch in ./http).
import type { ClioRecord, MatterSummary, SourceType } from "@/lib/types";
import { clioMatterUrl } from "./http";
import { htmlUnescape, normalizeBundle } from "./normalize";
import { fetchOpenMattersRaw, fetchRawBundle } from "./raw";

export { clioGet, clioFetch, clioMatterUrl, clioApiBase } from "./http";
export { downloadDocument } from "./download";
export { normalizeBundle, contentHash, htmlUnescape, matchProvider, roleKindFor } from "./normalize";

export function drawerKey(type: SourceType, clioId: string, page?: number): string {
  return page ? `${type}:${clioId}#p${page}` : `${type}:${clioId}`;
}

export async function listOpenMatters(): Promise<MatterSummary[]> {
  const raw = await fetchOpenMattersRaw();
  return raw.map((m) => ({
    clioId: String(m.id),
    displayNumber: String(m.display_number ?? m.id),
    description: htmlUnescape(String(m.description ?? "")),
    clientName: htmlUnescape(String(m.client?.name ?? "")),
    status: String(m.status ?? ""),
  }));
}

export async function fetchMatterRecords(matterId: string): Promise<ClioRecord[]> {
  const bundle = await fetchRawBundle(matterId);
  return normalizeBundle(bundle, { matterUrl: clioMatterUrl(String(bundle.matter.id)) });
}
