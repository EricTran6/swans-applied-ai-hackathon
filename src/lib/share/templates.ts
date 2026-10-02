// Provider-safe text is always templated from structure. Raw note/task/comm text never reaches a provider.

const MONTHS: Record<string, string> = {
  jan: "January", feb: "February", mar: "March", apr: "April", may: "May", jun: "June", jul: "July",
  aug: "August", sep: "September", sept: "September", oct: "October", nov: "November", dec: "December",
};

/** "since Jan 2025" / "after January 2025" / "from 2025-01" -> "after January 2025" (null if absent). */
export function servicePeriod(text: string): string | null {
  const m = /\b(?:since|after|from|through)\s+([A-Za-z]{3,9})\.?\s+(\d{4})\b/i.exec(text);
  if (m) {
    const mon = MONTHS[m[1].slice(0, 4).toLowerCase()] ?? MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (mon) return `after ${mon} ${m[2]}`;
  }
  const iso = /\b(?:since|after|from|through)\s+(\d{4})-(\d{2})(?:-\d{2})?\b/i.exec(text);
  if (iso) {
    const mon = Object.values(MONTHS)[Number(iso[2]) - 1];
    if (mon) return `after ${mon} ${iso[1]}`;
  }
  return null;
}

/** Rewrite an internal task into a provider-safe request. Falls back to a generic sentence. */
export function templateNeed(name: string, description: string): string {
  const text = `${name} ${description}`;
  const wantsLedger = /\b(ledger|itemi[sz]ed|billing|invoice|charges)\b/i.test(text);
  const wantsDate = /\b(surg(?:ical|ery)\s+date|date\s+of\s+surgery|schedul)/i.test(text);
  const wantsRecords = /\b(records|notes|chart|report|narrative|imaging|films)\b/i.test(text);
  const period = servicePeriod(text);
  const suffix = period ? ` for services ${period}` : "";
  const parts: string[] = [];
  if (wantsLedger) parts.push(`an itemized ledger${suffix}`);
  if (wantsRecords) parts.push(wantsLedger ? "updated treatment records" : `updated treatment records${suffix}`);
  let out = parts.length ? `Send ${parts.join(" and ")}` : "";
  if (wantsDate) out = out ? `${out}, and confirm the surgery date` : "Confirm the planned surgery date";
  return out || "Send the documents the firm requested";
}

/** Coarse status sentence for a structured event title. Unknown shapes return null (excluded). */
export function templateUpdate(title: string, category: string): string | null {
  const t = title.toLowerCase();
  if (/\b(suit|complaint|summons|action)\b.*\b(filed|commenced)\b|\bfiled\b.*\b(suit|complaint)\b/.test(t)) return "Lawsuit filed";
  if (/\b(coverage|limits?|policy)\b.*\b(confirmed|verified)\b|\bconfirmed\b.*\b(coverage|limits?)\b/.test(t)) return "Insurance coverage confirmed in writing";
  if (/\brecords?\b.*\breceived\b|\breceived\b.*\brecords?\b/.test(t)) return "Records received by the firm";
  if (/\bsurg(?:ery|ical)\b.*\brecommended\b|\brecommended\b.*\bsurg/.test(t)) return "Surgery recommended, date pending";
  if (/\bretained\b|\bengaged\b/.test(t) && category === "legal") return "Firm retained";
  if (/\b(trial|mediation|arbitration)\b.*\b(scheduled|set)\b/.test(t)) return "Court date scheduled";
  if (/\bdiscovery\b/.test(t) && category === "legal") return "Case in discovery";
  return null;
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2023-07-04" (or any ISO string starting with a date) -> "Jul 4, 2023"; null when there is no date. No timezone math. */
export function formatShortDate(iso: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return null;
  const mon = SHORT_MONTHS[Number(m[2]) - 1];
  return mon ? `${mon} ${Number(m[3])}, ${m[1]}` : null;
}

/**
 * Dated status line for correspondence with the recipient provider. The subject only picks the template
 * (records / bill / generic); its words never reach the provider. Null when the date is missing.
 */
export function templateCorrespondence(subject: string, outbound: boolean, date: string | null | undefined): string | null {
  const when = formatShortDate(date);
  if (!when) return null;
  const s = subject.toLowerCase();
  const records = /\b(records?|chart|notes|report|narrative|imaging|films)\b/.test(s);
  const bill = /\b(ledger|bill|billing|invoice|charges|itemi[sz]ed)\b/.test(s);
  if (outbound) {
    if (bill) return `Itemized ledger request sent ${when}`;
    if (records) return `Records request sent ${when}`;
    return `Request sent to your office ${when}`;
  }
  if (records) return `Your records received ${when}`;
  if (bill) return `Your bill received ${when}`;
  return `Correspondence received from your office ${when}`;
}

/** "02-pleadings__bill-of-particulars.pdf" -> "Bill of particulars" */
export function humanizeFilename(filename: string): string {
  const base = filename.replace(/\.[a-z0-9]{2,5}$/i, "");
  const afterFolder = base.includes("__") ? base.slice(base.lastIndexOf("__") + 2) : base.replace(/^\d{1,3}[-_ ]/, "");
  const words = afterFolder.replace(/[-_]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1).toLowerCase() : "Document";
}

/** Any text headed to a provider must be free of money and internal vocabulary. */
export const LEAK_RE = /\$|\b\d{1,3}(?:,\d{3})+\b|\b(settle\w*|offer\w*|demand\w*|strateg\w*|privileged|valuation|lien|liens|credibility|posture|ime|medicaid|medicare)\b/i;
export function isProviderSafe(text: string): boolean { return !LEAK_RE.test(text); }
