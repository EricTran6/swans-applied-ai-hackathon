// STUB (owner T01). GET-only Clio client. Any non-GET must throw.
import type { ClioRecord, Document, MatterSummary, SourceType } from "@/lib/types";
export async function clioGet<T>(_path: string, _params: Record<string, string>): Promise<T[]> { throw new Error("not implemented"); }
export function clioMatterUrl(_matterId: string): string { throw new Error("not implemented"); }
export function drawerKey(type: SourceType, clioId: string, page?: number): string {
  return page ? `${type}:${clioId}#p${page}` : `${type}:${clioId}`;
}
export async function listOpenMatters(): Promise<MatterSummary[]> { throw new Error("not implemented"); }
export async function fetchMatterRecords(_matterId: string): Promise<ClioRecord[]> { throw new Error("not implemented"); }
export async function downloadDocument(_doc: Document): Promise<Buffer> { throw new Error("not implemented"); }
