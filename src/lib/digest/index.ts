// Deterministic digest: all arithmetic, ranking, lanes, timeline, change diff. No AI here.
import type { ChangeEntry, ClioRecord, Digest, DocumentText, ExtractedFacts, LlmRef, Matter, SourceRef } from "@/lib/types";
import { actionBoard, nextDeadlineKpi, solStatus } from "./actions";
import { inputSetHash as hashRecords, diffSince as diff } from "./changes";
import { clientSnapshot, lastClientContact, lastContactKpi } from "./contact";
import { moneyKpis, providerBills, valueWaterfall } from "./kpis";
import { topTen } from "./rank";
import { inferStage } from "./stage";
import { buildTimeline, incidentField } from "./timeline";
import { dayKey, metaRef } from "./util";
import { validateRefs as validate } from "./validator";

export { dateDerivation } from "./validator";
export { coverageCap } from "./kpis";
export { SIGNAL_TERMS, scoreRecords } from "./rank";
export { STAGE_LABELS } from "./stage";

export type DeterministicDigest = Omit<Digest, "version" | "brief" | "openQuestions" | "injuries" | "meta" | "inputSetHash" | "createdAt">;

const KPI_ORDER = ["case_value", "coverage", "specials", "firm_spend", "last_client_contact", "next_deadline"];

export function computeDeterministic(input: { matter: Matter; records: ClioRecord[]; facts: ExtractedFacts | null;
  changeFeed: ChangeEntry[]; now: Date }): DeterministicDigest {
  const { matter, records, facts, changeFeed, now } = input;
  const asOf = dayKey(now.toISOString())!;
  const lastContact = lastClientContact(matter, records, now);
  const client = clientSnapshot(matter, records, now, lastContact);
  const kpis = [...moneyKpis(matter, records, facts, asOf), lastContactKpi(lastContact, asOf), nextDeadlineKpi(records, now, asOf)]
    .sort((a, b) => KPI_ORDER.indexOf(a.key) - KPI_ORDER.indexOf(b.key));
  const inc = incidentField(matter, records);
  return {
    matterId: matter.clioId,
    header: {
      clientName: client.name, clientInitials: client.initials, displayNumber: matter.displayNumber,
      description: matter.description, status: matter.status, matterUrl: matter.clioUrl ?? null,
      incidentDate: inc ? metaRef(inc, dayKey(String(inc.value))!) : null,
      sol: solStatus(matter, records),
    },
    client,
    kpis,
    coverage: facts?.coverage ?? [],
    valueWaterfall: valueWaterfall(facts, records),
    providerBills: providerBills(records),
    topTen: topTen(records, asOf, client.name),
    totalItems: records.filter((r) => r.sourceType !== "custom_field").length,
    actionBoard: actionBoard(matter, records, now),
    timeline: buildTimeline(matter, records),
    stage: inferStage(matter, records, now),
    changeFeed,
  };
}

export function validateRefs(refs: LlmRef[], records: ClioRecord[], docTexts: DocumentText[]):
  { refs: SourceRef[]; dropped: number } {
  return validate(refs, records, docTexts);
}
export function inputSetHash(records: ClioRecord[]): string { return hashRecords(records); }
export function diffSince(records: ClioRecord[], sinceIso: string): ChangeEntry[] { return diff(records, sinceIso); } // "Compare since" by sourceDate
