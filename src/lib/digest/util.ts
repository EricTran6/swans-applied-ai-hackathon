// Shared helpers for the deterministic digest: day math, money formatting, refs, text/name matching.
import type { ClioRecord, Communication, Contact, Party, SourceRef } from "@/lib/types";

const DAY_MS = 86_400_000;

/** Calendar day "YYYY-MM-DD" as written in the source (keeps the source's local date). */
export function dayKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  if (m) return m[1];
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}
export const todayKey = (now: Date) => now.toISOString().slice(0, 10);
const dayNum = (key: string) => Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10)) / DAY_MS;
/** Whole days from a to b (b - a), on calendar days. */
export function daysBetween(a: string, b: string): number {
  return Math.round(dayNum(dayKey(b)!) - dayNum(dayKey(a)!));
}
export const addDays = (key: string, n: number) => new Date((dayNum(key) + n) * DAY_MS).toISOString().slice(0, 10);

export const usd = (n: number) =>
  (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });

export function metaRef(r: ClioRecord, value: string): SourceRef {
  return {
    value, sourceType: r.sourceType, clioId: r.clioId, sourceDate: r.sourceDate, quote: null,
    drawerKey: r.drawerKey, ...(r.clioUrl ? { clioUrl: r.clioUrl } : {}),
    derivation: "clio-metadata", quoteVerified: false,
  };
}

/** Lowercase, straight quotes, unified dashes, collapsed whitespace (handles hard line breaks). */
export function normText(s: string): string {
  return s
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/ /g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const ORG_SUFFIX = /^(pllc|llc|inc|pc|pa|corp|co|ltd|lp|llp|md|dds|the|of|and)$/;
/** Distinctive lowercase tokens of a contact name (legal suffixes dropped). */
export function nameTokens(name: string): string[] {
  return normText(name).split(/[^a-z0-9]+/).filter((t) => t.length >= 2 && !ORG_SUFFIX.test(t));
}
/** True when every distinctive token of `name` appears as a word in `text`. */
export function mentionsName(text: string, name: string): boolean {
  const toks = nameTokens(name);
  if (!toks.length) return false;
  const words = new Set(normText(text).split(/[^a-z0-9]+/));
  return toks.every((t) => words.has(t));
}

export function partyIs(p: Party, c: { clioId: string; name: string }): boolean {
  if (p.contactId && p.contactId === c.clioId) return true;
  return normText(p.name) === normText(c.name);
}
export const isFirmParty = (p: Party) => p.kind === "User";
export const commInvolves = (c: Communication, who: { clioId: string; name: string }) =>
  c.senders.some((p) => partyIs(p, who)) || c.receivers.some((p) => partyIs(p, who));

export const isOpenTask = (status: string) => !/^(complete|completed|done|closed)$/i.test(status);

export function byType<T extends ClioRecord["sourceType"]>(records: ClioRecord[], t: T) {
  return records.filter((r) => r.sourceType === t) as Extract<ClioRecord, { sourceType: T }>[];
}
export const clientContact = (records: ClioRecord[], clientId: string | null): Contact | null =>
  byType(records, "contact").find((c) => c.isClient || (clientId != null && c.clioId === clientId)) ?? null;

/** Money amounts like "$12,000" or "$9,400.50" present in text. */
export const DOLLAR_RE = /\$\s?\d[\d,]*(\.\d+)?/;

export function firstSentence(s: string, max = 120): string {
  const t = s.replace(/\s+/g, " ").trim();
  const m = /^(.+?[.!?])(\s|$)/.exec(t);
  const out = m ? m[1] : t;
  return out.length > max ? out.slice(0, max - 1).trimEnd() + "…" : out;
}
