// Generic helpers shared by the AI stages. No case-specific knowledge lives here.
import type { ClioRecord, SourceRef } from "@/lib/types";

/** Business date for ordering; null sorts last. */
export function dateKey(r: { sourceDate: string | null }): string { return r.sourceDate ?? ""; }

export function byDateDesc<T extends { sourceDate: string | null }>(a: T, b: T): number {
  return dateKey(b).localeCompare(dateKey(a));
}

/** Compact one-record block for a prompt: id line, then body (truncated). */
export function recordBlock(r: ClioRecord, maxBody = 1500): string {
  const body = r.bodyText.length > maxBody ? r.bodyText.slice(0, maxBody) + " …" : r.bodyText;
  const head = `[${r.drawerKey}] ${r.sourceDate ?? "undated"} · ${r.sourceType} · ${r.title}`;
  return body.trim() ? `${head}\n${body}` : head;
}

/**
 * True when the quote plainly contains the number (digits with separators stripped), or the
 * same value written with a k/m suffix ("$250k"). Used to enforce "numbers only with a quote".
 */
export function quoteContainsNumber(quote: string | null, n: number | null): boolean {
  if (n === null || n === undefined) return true;
  if (!quote) return false;
  const flat = quote.replace(/[,\s]/g, "").toLowerCase();
  const whole = Number.isInteger(n) ? String(n) : String(n);
  if (flat.includes(whole)) return true;
  for (const [suffix, mult] of [["k", 1_000], ["m", 1_000_000]] as const) {
    if (n % mult === 0 && flat.includes(`${n / mult}${suffix}`)) return true;
  }
  return false;
}

/** Deterministic-ish: earliest of two ISO dates (nulls lose). */
export function earliest(a: string | null, b: string | null): string | null {
  if (!a) return b; if (!b) return a; return a < b ? a : b;
}

export function latestRef(refs: SourceRef[]): SourceRef | null {
  if (refs.length === 0) return null;
  return [...refs].sort(byDateDesc)[0];
}

export function normName(s: string): string { return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
