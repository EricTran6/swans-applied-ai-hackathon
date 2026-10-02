// Quote highlighter: case / whitespace / line-break / smart-punctuation insensitive match.

function normChar(ch: string): string {
  if (/\s/.test(ch)) return " ";
  if (ch === "‘" || ch === "’") return "'";
  if (ch === "“" || ch === "”") return '"';
  if (ch === "–" || ch === "—") return "-";
  return ch.toLowerCase();
}

/** Normalize text and keep a map from each normalized index back to the original index. */
export function normalizeWithMap(text: string): { norm: string; map: number[] } {
  let norm = "";
  const map: number[] = [];
  let prevSpace = true; // trims leading whitespace
  for (let i = 0; i < text.length; i++) {
    const c = normChar(text[i]);
    if (c === " ") {
      if (prevSpace) continue;
      prevSpace = true;
    } else prevSpace = false;
    norm += c;
    map.push(i);
  }
  if (norm.endsWith(" ")) { norm = norm.slice(0, -1); map.pop(); }
  return { norm, map };
}

export function normalizeQuote(q: string): string {
  return normalizeWithMap(q).norm;
}

/** Range [start, end) in the ORIGINAL text, or null if the quote is not found. */
export function findQuoteRange(text: string, quote: string | null | undefined): { start: number; end: number } | null {
  if (!quote) return null;
  const q = normalizeQuote(quote);
  if (!q) return null;
  const { norm, map } = normalizeWithMap(text);
  const idx = norm.indexOf(q);
  if (idx < 0) return null;
  return { start: map[idx], end: map[idx + q.length - 1] + 1 };
}

export type Segment = { text: string; hit: boolean };

/** Split text into plain / highlighted segments. Always returns at least one segment. */
export function splitByQuote(text: string, quote: string | null | undefined): Segment[] {
  const r = findQuoteRange(text, quote);
  if (!r) return [{ text, hit: false }];
  const out: Segment[] = [];
  if (r.start > 0) out.push({ text: text.slice(0, r.start), hit: false });
  out.push({ text: text.slice(r.start, r.end), hit: true });
  if (r.end < text.length) out.push({ text: text.slice(r.end), hit: false });
  return out;
}

/** For PDF text items: indices of items overlapping the quote in the concatenated page text. */
export function matchTextItems(items: string[], quote: string | null | undefined): Set<number> {
  const bounds: { start: number; end: number }[] = [];
  let full = "";
  for (const s of items) {
    bounds.push({ start: full.length, end: full.length + s.length });
    full += s + " ";
  }
  const r = findQuoteRange(full, quote);
  const hit = new Set<number>();
  if (!r) return hit;
  bounds.forEach((b, i) => { if (b.start < r.end && b.end > r.start && items[i].trim()) hit.add(i); });
  return hit;
}
