// Map the Clio matter stage name plus record evidence to a generic PI StageKey.
import type { ClioRecord, Digest, Matter, SourceRef, StageKey } from "@/lib/types";
import { byType, daysBetween, dayKey, metaRef, normText } from "./util";

export const STAGE_LABELS: Record<StageKey, string> = {
  intake: "Intake", treatment: "Treating", records: "Gathering records", demand: "Demand",
  negotiation: "Pre-suit negotiation", pleadings: "In litigation (pleadings)", discovery: "In litigation (discovery)",
  mediation: "Mediation", trial: "Trial", settlement: "Settled", disbursement: "Settled / paying liens", closed: "Closed",
};
const NAME_RULES: [StageKey, RegExp][] = [
  ["closed", /\bclosed?\b/], ["disbursement", /disburs/], ["settlement", /settle/], ["trial", /\btrial\b/],
  ["mediation", /mediat|arbitrat/], ["discovery", /discover|deposition/], ["pleadings", /litigat|suit|pleading|filed/],
  ["negotiation", /negotiat/], ["demand", /demand/], ["records", /record/], ["treatment", /treat|medical/],
  ["intake", /intake|consult|lead|sign/],
];
// Evidence inside litigation, latest phase first.
const LIT_EVIDENCE: [StageKey, RegExp][] = [
  ["trial", /\b(trial|jury selection)\b/], ["mediation", /\b(mediation|arbitration)\b/],
  ["discovery", /\b(deposition|ebt|discovery|compliance conference|preliminary conference|ime|interrogator\w*|bill of particulars)\b/],
];

export function inferStage(matter: Matter, records: ClioRecord[], now: Date): Digest["stage"] {
  const evidence: SourceRef[] = [];
  const name = normText(matter.clioStage ?? "");
  let key: StageKey | null = /^closed$/i.test(matter.status) ? "closed" : NAME_RULES.find(([, re]) => re.test(name))?.[0] ?? null;
  if (key && matter.clioStage) evidence.push(metaRef(matter, matter.clioStage));
  const today = dayKey(now.toISOString())!;
  const items = [...byType(records, "calendar_entry"), ...byType(records, "task")];
  const suit = items.find((r) => /\b(suit|complaint)\b.*\b(filed|commenced)\b/.test(normText(r.title)));
  if (!key && suit) { key = "pleadings"; evidence.push(metaRef(suit, dayKey(suit.sourceDate) ?? suit.title)); }
  if (key === "pleadings" || key === "discovery") {
    // Most recent or upcoming litigation event decides the sub-phase.
    const dist = (d: string) => (d ? Math.abs(daysBetween(d, today)) : Number.MAX_SAFE_INTEGER);
    const ranked = items.map((r) => ({ r, d: dayKey(r.sourceDate) ?? "" })).sort((a, b) => dist(a.d) - dist(b.d));
    for (const [k, re] of LIT_EVIDENCE) {
      const hit = ranked.find(({ r }) => re.test(normText(r.title)));
      if (hit) { key = k; evidence.push(metaRef(hit.r, hit.d || hit.r.title)); break; }
    }
  }
  key ??= "treatment";
  return { key, label: STAGE_LABELS[key], evidence, inferred: true };
}
