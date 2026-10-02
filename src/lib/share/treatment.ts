// Decides whether a calendar entry is the client's own treatment (safe to tell a provider about)
// versus firm communication/admin that merely mentions treatment. Fail-closed: when in doubt, false.
const TREATMENT_RE = /treatment|therap|chiro|visit|appointment|follow.?up|consult|surg|pre.?op|post.?op|evaluation/i;
const FIRM_ADMIN_RE = /\b(?:calls?|calling|phone|e-?mail(?:s|ed)?|letters?|fax(?:es)?|chasers?|reminders?|requests?|records?|ledger|bills?|re|deadlines?|conference|depositions?|court|ime)\b/i;

export function isTreatmentEntry(summary: string): boolean {
  return TREATMENT_RE.test(summary) && !FIRM_ADMIN_RE.test(summary);
}
