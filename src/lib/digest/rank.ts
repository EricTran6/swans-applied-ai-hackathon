// Code-ranked "10 that matter": recency decay + generic PI signal terms + dollar amounts + open cross-refs.
import type { ClioRecord, RankedItem } from "@/lib/types";
import {
  byType, daysBetween, dayKey, displayTitle, DOLLAR_RE, isFirmParty, isOpenTask, mentionsName, normText, stripReplyPrefix,
  withoutNames,
} from "./util";

const HALF_LIFE_DAYS = 180;
export const SIGNAL_TERMS = ["limit", "coverage", "lien", "surgery", "deposition", "ime", "offer", "demand",
  "settlement", "posture", "summary"];
const W_SIGNAL = 0.15, MAX_SIGNAL = 0.6, W_DOLLAR = 0.2, W_OPEN = 0.25;
const RANKABLE = new Set(["note", "communication", "document", "task", "calendar_entry", "expense"]);

// Ordered: first match wins.
const CATEGORY_RULES: [RankedItem["category"], RegExp][] = [
  ["litigation", /\b(suit|complaint|deposition|conference|ime|court|trial|posture|discovery|motion|mediation|demand|offer|settlement)\b/],
  ["money", /\b(liens?|bills?|billing|ledgers?|specials|expenses?|fees?|invoices?|charges|employment|wages?|commissions?|payroll|earnings)\b/],
  ["insurance", /\b(coverage|limits?|adjuster|insur\w*|policy|carrier|um\/uim|no-fault|pip)\b/],
  ["liability", /\b(liability|fault|causation|police report|witness)\b/],
  ["medical", /\b(surgery|surgical|arthroscopy|therapy|pt|ortho\w*|er|mri|treat\w*|records|diagnos\w*|injur\w*|medical|chiro\w*)\b/],
];

const ruleCategory = (t: string) => CATEGORY_RULES.find(([, re]) => re.test(t))?.[0] ?? null;

/** Title decides (reply prefix and contact names removed); body is a fallback only when the title says nothing. */
export function categorize(r: ClioRecord, clientName: string, names: string[] = []): RankedItem["category"] {
  if (r.sourceType === "expense") return "money";
  const cat = ruleCategory(withoutNames(stripReplyPrefix(displayTitle(r)), names)) ?? ruleCategory(withoutNames(r.bodyText, names));
  if (cat) return cat;
  const t = normText(`${r.title} ${r.bodyText}`);
  if (mentionsName(t, clientName) || /\bclient\b/.test(t)) return "client";
  return "other";
}

const STOP = new Set(["a", "an", "the", "and", "or", "of", "to", "for", "in", "on", "at", "by", "with", "from", "re", "about",
  "your", "our", "my", "is", "are", "was", "be"]);
/** Thread identity: topic = first two content words of the subject (reply prefix and names removed, stemmed to
 * five letters); counterparty = the non-firm parties of a communication ("" for other records). */
export function threadKey(r: ClioRecord, names: string[]): { topic: string; party: string } {
  const words = withoutNames(stripReplyPrefix(displayTitle(r)), names).split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2 && !STOP.has(w));
  const topic = words.slice(0, 2).map((w) => w.slice(0, 5)).join(" ") || r.drawerKey;
  const party = r.sourceType === "communication"
    ? [...new Set([...r.senders, ...r.receivers].filter((p) => !isFirmParty(p)).map((p) => p.contactId ?? normText(p.name)))]
      .sort().join(",")
    : "";
  return { topic, party };
}
const sameThread = (a: { topic: string; party: string }, b: { topic: string; party: string }) =>
  a.topic === b.topic && (a.party === b.party || !a.party || !b.party);

export function signalCount(text: string): number {
  const words = normText(text).split(/[^a-z0-9]+/);
  return SIGNAL_TERMS.filter((s) => words.some((w) => w === s || w === `${s}s`)).length;
}

export function scoreRecords(records: ClioRecord[], today: string): { rec: ClioRecord; score: number }[] {
  // Names the still-open tasks refer to (contacts named in them) -> records touching those names get a boost.
  const contacts = byType(records, "contact");
  const openTasks = byType(records, "task").filter((t) => isOpenTask(t.status));
  const openNames = contacts.filter((c) => openTasks.some((t) => mentionsName(`${t.name} ${t.description}`, c.name)));
  const seen = new Set<string>();
  const out: { rec: ClioRecord; score: number }[] = [];
  for (const r of records) {
    if (!RANKABLE.has(r.sourceType) || seen.has(r.drawerKey)) continue;
    seen.add(r.drawerKey);
    const d = dayKey(r.sourceDate);
    // Future-dated items (upcoming tasks/events) are not activity yet: neutral recency; undated: low.
    const age = d ? daysBetween(d, today) : HALF_LIFE_DAYS * 4;
    const recency = age < 0 ? 0.5 : Math.pow(0.5, age / HALF_LIFE_DAYS);
    const text = `${r.title} ${r.bodyText}`;
    const signal = Math.min(MAX_SIGNAL, signalCount(text) * W_SIGNAL);
    const dollars = DOLLAR_RE.test(text) ? W_DOLLAR : 0;
    let parties = text;
    if (r.sourceType === "communication") parties += " " + [...r.senders, ...r.receivers].map((p) => p.name).join(" ");
    const open = r.sourceType !== "task" && openNames.some((c) => mentionsName(parties, c.name)) ? W_OPEN : 0;
    out.push({ rec: r, score: Math.round((recency + signal + dollars + open) * 1000) / 1000 });
  }
  return out.sort((a, b) => b.score - a.score || (b.rec.sourceDate ?? "").localeCompare(a.rec.sourceDate ?? ""));
}

/** Highest-scored item per thread, so the list covers n different topics. */
export function topTen(records: ClioRecord[], today: string, clientName: string, n = 10): RankedItem[] {
  const names = byType(records, "contact").filter((c) => !c.isClient).map((c) => c.name);
  const kept: { rec: ClioRecord; score: number; key: { topic: string; party: string } }[] = [];
  for (const { rec, score } of scoreRecords(records, today)) {
    if (kept.length >= n) break;
    const key = threadKey(rec, names);
    if (!kept.some((k) => sameThread(k.key, key))) kept.push({ rec, score, key });
  }
  return kept.map(({ rec, score }, i) => ({
    rank: i + 1, score, title: displayTitle(rec), why: "", category: categorize(rec, clientName, names),
    date: dayKey(rec.sourceDate),
    ref: { value: displayTitle(rec), sourceType: rec.sourceType, clioId: rec.clioId, sourceDate: rec.sourceDate, quote: null,
      drawerKey: rec.drawerKey, ...(rec.clioUrl ? { clioUrl: rec.clioUrl } : {}), derivation: "clio-metadata",
      quoteVerified: false },
  }));
}
