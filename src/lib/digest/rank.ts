// Code-ranked "10 that matter": recency decay + generic PI signal terms + dollar amounts + open cross-refs.
import type { ClioRecord, RankedItem } from "@/lib/types";
import { byType, daysBetween, dayKey, DOLLAR_RE, isOpenTask, mentionsName, normText } from "./util";

const HALF_LIFE_DAYS = 180;
export const SIGNAL_TERMS = ["limit", "coverage", "lien", "surgery", "deposition", "ime", "offer", "demand",
  "settlement", "posture", "summary"];
const W_SIGNAL = 0.15, MAX_SIGNAL = 0.6, W_DOLLAR = 0.2, W_OPEN = 0.25;
const RANKABLE = new Set(["note", "communication", "document", "task", "calendar_entry", "expense"]);

const CATEGORY_RULES: [RankedItem["category"], RegExp][] = [
  ["litigation", /\b(suit|complaint|deposition|conference|ime|court|trial|posture|discovery|motion|mediation|demand|offer|settlement)\b/],
  ["insurance", /\b(coverage|limits?|adjuster|insur\w*|policy|carrier|um\/uim|no-fault|pip)\b/],
  ["money", /\b(lien|bills?|ledger|specials|expense|fee|invoice|charges)\b/],
  ["liability", /\b(liability|fault|causation|police report|witness)\b/],
  ["medical", /\b(surgery|arthroscopy|therapy|pt|ortho\w*|er|mri|treat\w*|records|diagnos\w*|injur\w*|medical|chiro\w*)\b/],
];

export function categorize(r: ClioRecord, clientName: string): RankedItem["category"] {
  if (r.sourceType === "expense") return "money";
  const t = normText(`${r.title} ${r.bodyText}`);
  for (const [cat, re] of CATEGORY_RULES) if (re.test(t)) return cat;
  if (mentionsName(t, clientName) || /\bclient\b/.test(t)) return "client";
  return "other";
}

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

export function topTen(records: ClioRecord[], today: string, clientName: string, n = 10): RankedItem[] {
  return scoreRecords(records, today).slice(0, n).map(({ rec, score }, i) => ({
    rank: i + 1, score, title: rec.title, why: "", category: categorize(rec, clientName),
    date: dayKey(rec.sourceDate),
    ref: { value: rec.title, sourceType: rec.sourceType, clioId: rec.clioId, sourceDate: rec.sourceDate, quote: null,
      drawerKey: rec.drawerKey, ...(rec.clioUrl ? { clioUrl: rec.clioUrl } : {}), derivation: "clio-metadata",
      quoteVerified: false },
  }));
}
