// Shared contract (docs/contract.md sections 3, 4, 9 + section 10 v2 deltas). Lead-owned: agents do not edit.

// ---------- 3. Normalized Clio records ----------
export type SourceType =
  | 'matter' | 'custom_field' | 'contact' | 'note' | 'communication'
  | 'task' | 'calendar_entry' | 'expense' | 'document';

export interface RecordBase {
  sourceType: SourceType;
  clioId: string;            // always string
  matterId: string;
  createdAt: string;         // ISO. WARNING: seed time in demo data; never use for change detection or timelines
  updatedAt: string;         // ISO. Same warning.
  sourceDate: string | null; // business date: note.date, comm.occurredAt, task.dueAt, expense.date, calendar.startAt, document.receivedAt
  title: string;             // one-line label for chips/lists
  bodyText: string;          // html-unescaped text sent to the LLM and used for quote matching ('' if none)
  drawerKey: string;         // "<sourceType>:<clioId>" — opens the evidence drawer
  clioUrl?: string;          // optional; only the matter URL is reliable
  etag: string | null;
  contentHash: string;       // sha256 of canonical JSON of projected fields (or etag); NEVER derived from updatedAt
}
export interface Party { contactId: string | null; name: string; kind: 'Person' | 'Company' | 'User' }
export interface CustomFieldValue extends RecordBase {
  sourceType: 'custom_field'; fieldId: string; name: string; fieldType: string;
  value: string | number | boolean | null; display: string;
}
export interface Matter extends RecordBase {
  sourceType: 'matter'; displayNumber: string; description: string;
  status: 'Open' | 'Pending' | 'Closed' | string; openDate: string | null; closeDate: string | null;
  practiceArea: string | null; clioStage: string | null;
  sol: { dueAt: string | null; status: string | null } | null;
  responsibleAttorney: Party | null; client: Party; customFields: CustomFieldValue[];
}
export interface Contact extends RecordBase {
  sourceType: 'contact'; name: string; kind: 'Person' | 'Company';
  firstName: string | null; lastName: string | null; initials: string | null;
  dateOfBirth: string | null; avatarUrl: string | null;
  email: string | null; phone: string | null; company: string | null;
  role: string | null;       // matter relationship description, e.g. "Treating provider, physical therapy"
  roleKind: 'client' | 'provider' | 'adverse' | 'insurer' | 'other';
  isClient: boolean;
}
export interface Note extends RecordBase { sourceType: 'note'; subject: string; date: string | null; author: Party | null }
export interface Communication extends RecordBase {
  sourceType: 'communication'; kind: 'Email' | 'Phone' | string; subject: string;
  occurredAt: string; senders: Party[]; receivers: Party[]; user: Party | null;
}
export interface Task extends RecordBase {
  sourceType: 'task'; name: string; description: string;
  status: 'pending' | 'in_progress' | 'complete' | string;
  priority: string | null; dueAt: string | null; completedAt: string | null; isSol: boolean;
  assignee: Party | null;
}
export interface CalendarEntry extends RecordBase {
  sourceType: 'calendar_entry'; summary: string; description: string; location: string | null;
  startAt: string; endAt: string | null; allDay: boolean; attendees: Party[];
}
// Expense rows come in two shapes (split by SHAPE, never by a "DEMO" string):
//   firm:          total != null                          -> firm spend
//   provider_bill: total == null && nonBillableTotal != null -> a provider's medical bill (specials)
export interface Expense extends RecordBase {
  sourceType: 'expense'; kind: 'firm' | 'provider_bill';
  date: string; amount: number;           // firm: total; provider_bill: nonBillableTotal
  category: string | null; description: string; billed: boolean;
  providerContactId: string | null;       // provider_bill only: matched to a provider contact (null if no confident match)
  billFilename: string | null;            // provider_bill only: filename parsed from the note, if present
}
export interface Document extends RecordBase {
  sourceType: 'document'; name: string; filename: string; contentType: string | null; size: number | null;
  folder: string | null; receivedAt: string | null;
  latestVersionId: string | null; latestVersionUuid: string | null; // cache key for downloaded file + text
  pageCount: number | null; textLayer: boolean | null;              // filled by ingest PDF step
}
export type ClioRecord = Matter | CustomFieldValue | Contact | Note | Communication
  | Task | CalendarEntry | Expense | Document;

// Extracted PDF text, per page (ingest writes, AI/evidence read). pages[0] is page 1.
export interface DocumentText { clioId: string; versionUuid: string | null; pageCount: number; pages: string[] }

// ---------- 4. Provenance and Digest ----------
export type Derivation = 'stated' | 'inferred' | 'clio-metadata';
export interface SourceRef {
  value: string;             // the fact/date/number this ref supports, as displayed
  sourceType: SourceType; clioId: string; sourceDate: string | null;
  quote: string | null;      // verbatim span of record.bodyText (or of the PDF page for documents)
  page?: number;             // documents only, absolute 1-indexed
  drawerKey: string;         // "note:123" | "document:55#p3"
  clioUrl?: string;
  derivation: Derivation;
  quoteVerified: boolean;    // true = substring match passed
}
export interface Claim { text: string; refs: SourceRef[] }  // refs.length >= 1 after validation

export type KpiKey = 'case_value' | 'coverage' | 'firm_spend' | 'last_client_contact' | 'next_deadline' | 'specials';
export interface Kpi {
  key: KpiKey; label: string; display: string;
  value: number | null; unit: 'usd' | 'days' | 'date' | 'count' | 'text';
  range?: { low: number; high: number; cap: number | null };
  status: 'ok' | 'warn' | 'danger' | 'unknown';  // unknown => "Not recorded in Clio"
  asOf: string; refs: SourceRef[]; conflicts?: SourceRef[]; computedBy: 'code'; note?: string;
}
export interface CoverageLayer {
  kind: 'BI' | 'UM/UIM' | 'No-fault/PIP' | 'MedPay' | 'Umbrella' | 'Health/Lien' | 'Other';
  perPerson: number | null; perAccident: number | null; carrier: string | null;
  exhausted?: boolean; refs: SourceRef[];
}
export interface WaterfallStep { label: string; amount: number; kind: 'start' | 'minus' | 'result'; refs: SourceRef[] }
export interface ProviderBill { providerContactId: string | null; providerName: string; amount: number;
  servicesThrough: string | null; refs: SourceRef[] }
export interface RankedItem { rank: number; score: number; title: string; why: string;
  category: 'medical' | 'insurance' | 'liability' | 'client' | 'litigation' | 'money' | 'other';
  date: string | null; ref: SourceRef }
export interface WaitingOn { name: string; contactId: string | null;
  kind: 'provider' | 'client' | 'adverse' | 'other'; requests: number; daysSilent: number | null }
export interface ActionItem { id: string; title: string; due: string | null; owner: string | null;
  origin: 'clio-task' | 'clio-calendar' | 'ai-suggested'; daysLate?: number; daysUntil?: number;
  waitingOn?: WaitingOn; refs: SourceRef[] }
export interface TimelineEvent { id: string;  // sha1(date|title|first ref clioId)
  date: string; derivation: Derivation; title: string;
  category: 'incident' | 'treatment' | 'legal' | 'insurance' | 'communication' | 'money';
  milestone: boolean;        // true => shown on the story strip
  refs: SourceRef[] }
export interface Injury { name: string; bodyPart: string | null;
  status: 'surgery-done' | 'surgery-recommended' | 'diagnosed';
  firstDocumented: string | null; refs: SourceRef[] }  // >= 1 document page ref
export type StageKey = 'intake' | 'treatment' | 'records' | 'demand' | 'negotiation'
  | 'pleadings' | 'discovery' | 'mediation' | 'trial' | 'settlement' | 'disbursement' | 'closed';
export interface ChangeEntry { kind: 'new' | 'changed' | 'deleted'; sourceType: SourceType;
  clioId: string; title: string; sourceDate: string | null; detectedAt: string; drawerKey: string }
export interface ClientSnapshot {
  name: string; initials: string; age: number | null; avatarUrl: string | null;
  lastContact: { date: string; kind: 'Phone' | 'Email' | 'Note' | string; daysAgo: number; summary: string; ref: SourceRef } | null;
  nextTouchpoint: { date: string; title: string; ref: SourceRef } | null;
  statusChips: Claim[];      // e.g. "Treating weekly", "Out of work" — each cited
}

export interface Digest {
  matterId: string; version: number; createdAt: string; inputSetHash: string;
  header: { clientName: string; clientInitials: string; displayNumber: string; description: string;
    status: string; matterUrl: string | null; incidentDate: SourceRef | null;
    sol: { date: string; status: 'satisfied' | 'open' | 'unknown'; refs: SourceRef[] } | null };
  client: ClientSnapshot;
  brief: Claim[];                                  // 3-5 sentences
  kpis: Kpi[];
  coverage: CoverageLayer[];
  valueWaterfall: WaterfallStep[];
  providerBills: ProviderBill[];
  topTen: RankedItem[];                            // <= 10, ranked by code score
  totalItems: number;                              // "10 that matter out of N"
  actionBoard: { overdue: ActionItem[]; upcoming: ActionItem[]; waiting: ActionItem[]; suggested: ActionItem[] };
  timeline: TimelineEvent[];
  injuries: Injury[];
  stage: { key: StageKey; label: string; evidence: SourceRef[]; inferred: true };
  openQuestions: Claim[];
  changeFeed: ChangeEntry[];
  meta: { models: Record<string, string>; costUsd: number; droppedRefs: number;
    droppedClaims: number; warnings: string[]; builtAt: string; cached?: boolean };
}

// LLM output never uses SourceRef directly; validator hydrates LlmRef -> SourceRef.
export interface LlmRef { id: string /* "note:123" | "document:55" */; quote: string | null; page?: number }

export interface AiCall { matterId: string | null; stage: string; model: string;
  inputTokens: number; outputTokens: number; cacheReadTokens: number; usd: number }
export interface ExtractionKey { sourceType: SourceType; clioId: string; contentHash: string; extractorVersion: string }
export interface ExtractionCache { get(k: ExtractionKey): unknown | null; set(k: ExtractionKey, v: unknown): void }

export interface MatterSummary { clioId: string; displayNumber: string; description: string; clientName: string; status: string }
export interface SyncStatus { matterId: string; state: 'idle' | 'syncing' | 'digesting' | 'error';
  lastSyncedAt: string | null; lastDigestAt: string | null; message: string | null }

// ---------- 9. Provider share ----------
export type ShareCategory = 'status' | 'stage' | 'coverage' | 'appointments' | 'requests'
  | 'own_records' | 'own_bill' | 'other_records' | 'updates' | 'care_team'
  | 'valuation' | 'settlement' | 'attorney_notes' | 'liability' | 'firm_expenses'
  | 'other_liens' | 'client_pii' | 'internal_comms';
export interface SharePreset { allow: ShareCategory[]; optIn: ShareCategory[] } // everything else denied
export interface ShareCandidate { id: string /* "task:123" | "kpi:coverage" | "status:stage" */;
  category: ShareCategory; label: string; preview: string; included: boolean; hardDeny: boolean;
  providerContactId: string | null;
  flag: { level: 'ok' | 'review' | 'block'; reason: string } | null }
export interface ProviderView {
  firmName: string; recipientLabel: string; clientDisplayName: string; // "Jane D."
  attorneyNote: string | null;                    // free text written/approved by the attorney in the builder
  status: { label: string; alive: 'active' | 'stalled' | 'closed'; lastFirmActivity: string | null; nextEvent: string | null };
  stage: { label: 'Treating' | 'Pre-suit negotiation' | 'In litigation' | 'Settled / paying liens' | 'Closed' };
  coverage: { confirmed: boolean; confirmedOn: string | null; layers: { kind: string; limit: string }[] | null } | null;
  needs: { id: string; text: string; due: string | null }[];   // provider-safe templated text
  bill: { amount: number; servicesThrough: string | null; stale: boolean } | null; // this provider's own bill only
  appointments: { title: string; date: string }[];
  records: { name: string; date: string | null }[];
  updates: { date: string; text: string }[];       // templated from structured events, never note text
  careTeam?: { name: string; role: string }[];
  findings?: { text: string; source: string }[];  // "Left shoulder labral tear — Bill of Particulars p3"
  sharedAt: string; expiresAt: string;
}
// Provider -> firm replies (gap 7). Stored in our DB, shown to the attorney.
export interface ShareResponse { id: string; shareId: string; needId: string | null;
  kind: 'sent' | 'will_send' | 'note'; promisedDate: string | null; text: string | null; createdAt: string }
export interface ShareSummary { shareId: string; recipientLabel: string; recipientContactId: string | null;
  createdAt: string; expiresAt: string; revokedAt: string | null;
  views: number; firstViewedAt: string | null; lastViewedAt: string | null;
  sharedCount: number; withheldCount: number; responses: ShareResponse[] }

// ---------- 10. AI extraction output consumed by digest code (validated refs) ----------
export interface ExtractedFacts {
  caseValue: { amount: number; ref: SourceRef } | null;
  coverage: CoverageLayer[];                        // latest-dated source wins; conflicts kept
  coverageConfirmed: { confirmed: boolean; on: string | null; ref: SourceRef } | null;
  liens: { holder: string; amount: number | null; ref: SourceRef }[];
  conflicts: { field: 'coverage' | 'case_value' | 'specials' | 'liens'; refs: SourceRef[] }[];
}
export interface SynthesisOutput {
  brief: Claim[]; whys: Record<string, string> /* drawerKey -> why line */;
  openQuestions: Claim[]; statusChips: Claim[];
}
