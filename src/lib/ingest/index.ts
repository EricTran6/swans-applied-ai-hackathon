// STUB (owner T01). Sync one matter into our DB; diff by content hash; download + extract PDFs per version.
import type { ChangeEntry, ClioRecord, DocumentText } from "@/lib/types";
export async function syncMatter(_matterId: string): Promise<{ records: ClioRecord[]; events: ChangeEntry[]; documentTexts: DocumentText[] }> { throw new Error("not implemented"); }
export function loadRecords(_matterId: string): ClioRecord[] { throw new Error("not implemented"); }          // from DB, never Clio
export function getDocumentText(_clioId: string): DocumentText | null { throw new Error("not implemented"); }
export function getDocumentFilePath(_clioId: string): string | null { throw new Error("not implemented"); }   // cached PDF on disk
