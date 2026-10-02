// Input-set hash (cache key for the digest) and the "Compare since" diff by business date.
import { createHash } from "node:crypto";
import type { ChangeEntry, ClioRecord } from "@/lib/types";
import { dayKey } from "./util";

export function inputSetHash(records: ClioRecord[]): string {
  const lines = records.map((r) => `${r.drawerKey}\t${r.contentHash}`).sort();
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}

/** Records whose business date (sourceDate) is on/after `sinceIso`, newest first. */
export function diffSince(records: ClioRecord[], sinceIso: string): ChangeEntry[] {
  const since = dayKey(sinceIso);
  if (!since) return [];
  const seen = new Set<string>();
  return records
    .filter((r) => {
      const d = dayKey(r.sourceDate);
      if (!d || d < since || seen.has(r.drawerKey)) return false;
      seen.add(r.drawerKey);
      return true;
    })
    .map((r): ChangeEntry => ({ kind: "new", sourceType: r.sourceType, clioId: r.clioId, title: r.title,
      sourceDate: r.sourceDate, detectedAt: r.sourceDate!, drawerKey: r.drawerKey }))
    .sort((a, b) => (dayKey(b.sourceDate) ?? "").localeCompare(dayKey(a.sourceDate) ?? ""));
}
