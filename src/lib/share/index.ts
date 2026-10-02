// Share library (T05): fail-closed per-provider filtering, templated provider text, tokens, replies.
// Clio is never written. Persistence of shares/responses belongs to src/lib/db (T04).
export {
  DEFAULT_PRESET, HARD_DENY, ALL_CATEGORIES, ID_STATUS, ID_STAGE, ID_COVERAGE, ID_COVERAGE_LIMITS, ID_OWN_BILL,
  buildCandidates, isHardDeny, isKnownCategory, inScope,
} from "./candidates";
export { buildProviderView, stageLabel, clientDisplayName, STALE_BILL_DAYS, MAX_ATTORNEY_NOTE } from "./provider-view";
export { newShareToken, hashToken, verifyToken } from "./tokens";
export { flagCandidates, keywordDowngrade, KEYWORD_RE, type FlagClient, type FlagResult, type FlagLevel } from "./flags";
export { recordResponse, validateResponse, responseInputSchema, MAX_RESPONSE_TEXT, type ResponseInput } from "./responses";
export { templateNeed, templateUpdate, humanizeFilename, isProviderSafe } from "./templates";
export { providerFor, roleLabel } from "./scope";
