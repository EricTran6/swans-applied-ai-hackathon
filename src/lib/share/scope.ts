// Provider scoping: which provider contact a record is about. Generic PI logic driven by the
// matter's own contacts (relationship role), never by hardcoded names.
import type { ClioRecord, Contact, Party } from "@/lib/types";

const GENERIC = new Set([
  "the", "and", "of", "dr", "md", "do", "dc", "pt", "pc", "pllc", "llc", "llp", "inc", "ltd", "co", "corp", "group",
  "medical", "center", "centre", "clinic", "hospital", "health", "healthcare", "care", "physical", "therapy",
  "chiropractic", "chiropractor", "orthopaedic", "orthopedic", "orthopaedics", "orthopedics", "associates",
  "advanced", "new", "north", "south", "east", "west", "valley", "regional", "family", "sports", "spine", "pain",
  "rehab", "rehabilitation", "imaging", "radiology", "surgery", "surgical", "neurology", "institute", "practice",
]);

export function normalizeText(s: string): string {
  return ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
}

/** Distinctive tokens of a provider name (drops legal suffixes and generic medical words). */
export function nameTokens(name: string): string[] {
  const all = normalizeText(name).trim().split(" ").filter((t) => t.length >= 3);
  const distinctive = all.filter((t) => !GENERIC.has(t));
  return distinctive.length > 0 ? distinctive : all;
}

export function providers(records: ClioRecord[]): Contact[] {
  return records.filter((r): r is Contact => r.sourceType === "contact" && r.roleKind === "provider" && !r.isClient);
}

/** Score how strongly `text` names `contact`: number of distinctive tokens present (0 = no match). */
export function matchScore(text: string, contact: Contact): number {
  const t = normalizeText(text);
  if (contact.name && t.includes(normalizeText(contact.name))) return 100;
  const tokens = nameTokens(contact.name);
  if (tokens.length === 0) return 0;
  return tokens.filter((tok) => t.includes(` ${tok} `)).length;
}

/**
 * Which provider does this text name? Returns the single best match; ties or no match -> null (fail closed).
 */
export function providerFor(text: string, provs: Contact[], parties: Party[] = []): string | null {
  for (const p of parties) if (p.contactId && provs.some((c) => c.clioId === p.contactId)) return p.contactId;
  let best: { id: string; score: number } | null = null;
  let tie = false;
  for (const c of provs) {
    const s = matchScore(text, c);
    if (s === 0) continue;
    if (!best || s > best.score) { best = { id: c.clioId, score: s }; tie = false; }
    else if (s === best.score) tie = true;
  }
  return best && !tie ? best.id : null;
}

export const MAX_ROLE_LABEL = 60;

/** Index of the first comma outside parentheses, or -1. */
function topLevelComma(s: string): number {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === "," && depth === 0) return i;
  }
  return -1;
}

/** Drop any unclosed "(" group (and everything after it) and any stray ")". */
function balanceParens(s: string): string {
  let out = "";
  const opens: number[] = [];
  for (const ch of s) {
    if (ch === "(") opens.push(out.length);
    else if (ch === ")") { if (opens.length === 0) continue; opens.pop(); }
    out += ch;
  }
  return opens.length ? out.slice(0, opens[0]) : out;
}

/**
 * Short role label for a provider: "Treating provider, physical therapy" -> "Physical therapy".
 * Never splits inside parentheses, keeps them balanced, and caps at MAX_ROLE_LABEL characters.
 */
export function roleLabel(contact: Contact | undefined): string {
  let s = (contact?.role ?? "").replace(/treating provider/i, "");
  const comma = topLevelComma(s);
  if (comma >= 0) s = s.slice(comma + 1);
  s = s.trim();
  if (s.length > MAX_ROLE_LABEL) s = s.slice(0, MAX_ROLE_LABEL);
  s = balanceParens(s).trim().replace(/[\s,(\-–]+$/, "").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "Treating provider";
}
