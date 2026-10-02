// STUB (owner T03). Claude calls. Every call logs cost; every ref goes through digest.validateRefs.
import type { AiCall, ChangeEntry, ClioRecord, Digest, DocumentText, ExtractionCache, ExtractedFacts, Injury, Matter, SynthesisOutput } from "@/lib/types";
export async function extractFacts(_i: { matter: Matter; records: ClioRecord[]; cache: ExtractionCache; log: (c: AiCall) => void }): Promise<ExtractedFacts> { throw new Error("not implemented"); }
export async function extractInjuries(_i: { records: ClioRecord[]; docTexts: DocumentText[]; cache: ExtractionCache; log: (c: AiCall) => void }): Promise<Injury[]> { throw new Error("not implemented"); }
export async function synthesize(_i: { matter: Matter; records: ClioRecord[]; topIds: string[]; log: (c: AiCall) => void }): Promise<SynthesisOutput> { throw new Error("not implemented"); }
export async function buildDigest(_i: { matter: Matter; records: ClioRecord[]; docTexts: DocumentText[]; changeFeed: ChangeEntry[];
  prev: Digest | null; cache: ExtractionCache; log: (c: AiCall) => void; now: Date }): Promise<Omit<Digest, "version">> { throw new Error("not implemented"); }
