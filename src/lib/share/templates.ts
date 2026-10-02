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
