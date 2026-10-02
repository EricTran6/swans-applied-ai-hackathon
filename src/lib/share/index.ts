// STUB (owner T05). Share filtering: fail closed, never leak strategy/valuation/notes/other providers' bills.
import type { ClioRecord, Digest, ProviderView, ShareCandidate, SharePreset } from "@/lib/types";
export const DEFAULT_PRESET: SharePreset = { allow: ["status", "stage", "coverage", "appointments", "requests", "own_records", "own_bill", "updates"], optIn: ["other_records", "care_team"] };
export const HARD_DENY = ["valuation", "settlement", "attorney_notes", "internal_comms"] as const;
export function buildCandidates(_d: Digest, _records: ClioRecord[], _recipientContactId: string | null, _preset: SharePreset): ShareCandidate[] { throw new Error("not implemented"); }
export function buildProviderView(_d: Digest, _records: ClioRecord[], _includedIds: string[],
  _recipient: { label: string; contactId: string | null }, _attorneyNote: string | null, _now: Date): ProviderView { throw new Error("not implemented"); }
export function newShareToken(): { token: string; tokenHash: string } { throw new Error("not implemented"); }
export function hashToken(_token: string): string { throw new Error("not implemented"); }
