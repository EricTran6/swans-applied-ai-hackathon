// Hydrates model-emitted LlmRefs into SourceRefs (contract section 5). Drops anything unverifiable.
import type { ClioRecord, Derivation, DocumentText, LlmRef, SourceRef, SourceType } from "@/lib/types";
import { dayKey, normText } from "./util";

const STRUCTURED: SourceType[] = ["task", "calendar_entry", "expense", "custom_field", "matter", "contact"];

function parseId(id: string): { type: string; clioId: string; page?: number } | null {
  const m = /^([a-z_]+):([^#\s]+)(?:#p(\d+))?$/.exec(id.trim());
  return m ? { type: m[1], clioId: m[2], ...(m[3] ? { page: +m[3] } : {}) } : null;
}
const contains = (hay: string, needle: string) => {
  const n = normText(needle);
  return n.length > 0 && normText(hay).includes(n);
};

export function validateRefs(refs: LlmRef[], records: ClioRecord[], docTexts: DocumentText[]):
  { refs: SourceRef[]; dropped: number } {
  const byKey = new Map(records.map((r) => [`${r.sourceType}:${r.clioId}`, r]));
  const texts = new Map(docTexts.map((d) => [d.clioId, d]));
  const out: SourceRef[] = [];
  let dropped = 0;
  for (const ref of refs) {
    const id = parseId(ref.id);
    const rec = id ? byKey.get(`${id.type}:${id.clioId}`) : undefined;
    const page = ref.page ?? id?.page;
    const hydrated = rec ? hydrate(rec, ref.quote, page, texts.get(rec.clioId)) : null;
    if (hydrated) out.push(hydrated);
    else dropped++;
  }
  return { refs: out, dropped };
}

function hydrate(rec: ClioRecord, quote: string | null, page: number | undefined, text: DocumentText | undefined):
  SourceRef | null {
  const common = {
    sourceType: rec.sourceType, clioId: rec.clioId, sourceDate: rec.sourceDate,
    ...(rec.clioUrl ? { clioUrl: rec.clioUrl } : {}),
  };
  if (page !== undefined) {
    if (rec.sourceType !== "document") return null;
    const count = rec.pageCount ?? text?.pageCount ?? null;
    if (!Number.isInteger(page) || page < 1 || count == null || page > count) return null;
    const pageText = text?.pages[page - 1] ?? "";
    let verified = false;
    if (quote && pageText.trim()) {
      if (!contains(pageText, quote)) return null; // page has a text layer: quote must be on it
      verified = true;
    }
    return { ...common, value: quote ?? rec.title, quote, page, drawerKey: `${rec.drawerKey}#p${page}`,
      derivation: verified ? "stated" : "inferred", quoteVerified: verified };
  }
  if (quote == null || !quote.trim()) {
    if (!STRUCTURED.includes(rec.sourceType)) return null;
    return { ...common, value: rec.title, quote: null, drawerKey: rec.drawerKey,
      derivation: "clio-metadata", quoteVerified: false };
  }
  const hay = rec.sourceType === "document" && text ? [rec.bodyText, ...text.pages].join("\n") : rec.bodyText;
  if (!contains(hay, quote) && !contains(rec.title, quote)) return null;
  return { ...common, value: quote, quote, drawerKey: rec.drawerKey, derivation: "stated", quoteVerified: true };
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september",
  "october", "november", "december"];
/** Contract rule 7: a date is 'stated' only if it appears in the quote. */
export function dateDerivation(date: string, ref: Pick<SourceRef, "quote" | "sourceDate">): Derivation {
  const key = dayKey(date);
  if (!key) return "inferred";
  const [y, mo, d] = key.split("-").map(Number);
  const q = ref.quote ? normText(ref.quote) : "";
  if (q) {
    const mon = MONTHS[mo - 1];
    const forms = [key, `${mo}/${d}/${y}`, `${String(mo).padStart(2, "0")}/${String(d).padStart(2, "0")}/${y}`,
      `${mo}/${d}/${String(y).slice(2)}`, `${mon} ${d}, ${y}`, `${mon} ${d} ${y}`, `${mon.slice(0, 3)} ${d}, ${y}`,
      `${mon.slice(0, 3)}. ${d}, ${y}`, `${d} ${mon} ${y}`];
    if (forms.some((f) => q.includes(f))) return "stated";
  }
  return dayKey(ref.sourceDate) === key ? "clio-metadata" : "inferred";
}
