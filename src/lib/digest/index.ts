// STUB (owner T02). Deterministic digest: all arithmetic, ranking, lanes, timeline, change diff. No AI here.
import type { ChangeEntry, ClioRecord, Digest, DocumentText, ExtractedFacts, LlmRef, Matter, SourceRef } from "@/lib/types";
export type DeterministicDigest = Omit<Digest, "version" | "brief" | "openQuestions" | "injuries" | "meta" | "inputSetHash" | "createdAt">;
export function computeDeterministic(_input: { matter: Matter; records: ClioRecord[]; facts: ExtractedFacts | null;
  changeFeed: ChangeEntry[]; now: Date }): DeterministicDigest { throw new Error("not implemented"); }
export function validateRefs(_refs: LlmRef[], _records: ClioRecord[], _docTexts: DocumentText[]):
  { refs: SourceRef[]; dropped: number } { throw new Error("not implemented"); }
export function inputSetHash(_records: ClioRecord[]): string { throw new Error("not implemented"); }
export function diffSince(_records: ClioRecord[], _sinceIso: string): ChangeEntry[] { throw new Error("not implemented"); }   // "Compare since" by sourceDate
