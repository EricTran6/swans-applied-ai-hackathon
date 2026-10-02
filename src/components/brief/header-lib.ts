import { formatUsd, relativeTime } from "./lib";

// ---------- synced / built label ----------
/** "Last synced 5 min ago" when a sync run exists, else "Built 2 h ago" from the digest, else a neutral fallback. */
export function syncLabel(input: { lastSyncedAt: string | null | undefined; builtAt: string | null | undefined; now: number }): string {
  if (input.lastSyncedAt) return `Last synced ${relativeTime(input.lastSyncedAt, input.now)}`;
  if (input.builtAt) return `Built ${relativeTime(input.builtAt, input.now)}`;
  return "Not synced yet";
}

// ---------- AI cost ----------
export function costLabel(meta: { costUsd: number; cached?: boolean }): string {
  const built = `$${meta.costUsd.toFixed(2)}`;
  return meta.cached ? `This open: $0.00 (cached) · built for ${built}` : `This open: ${built} (fresh build)`;
}

// ---------- warnings ----------
export interface WarningGroup { stage: string; count: number; details: string[] }

const STAGE_WORD: Record<string, string> = { synthesize: "synthesis", synthesis: "synthesis" };

/** "extract_injuries#2" -> "injuries"; "synthesize" -> "synthesis". */
export function stageName(raw: string): string {
  const base = raw.trim().split(/[#:[(\s]/)[0].replace(/^extract_/, "");
  return STAGE_WORD[base] ?? (base || "unknown");
}

/** Remove API error JSON and long blobs so raw errors never reach the page. */
export function cleanWarning(w: string): string {
  const s = w
    .replace(/\{[\s\S]*\}/g, "")
    .replace(/\s+/g, " ")
    .replace(/\(\s*(\d{3})?\s*\)/g, (_m, code: string | undefined) => (code ? `(${code})` : ""))
    .trim();
  return s.length > 160 ? `${s.slice(0, 157)}…` : s;
}

/** One group per stage, in first-seen order. */
export function groupWarnings(warnings: string[]): WarningGroup[] {
  const groups = new Map<string, WarningGroup>();
  for (const w of warnings) {
    const stage = stageName(w.split(":")[0]);
    const g = groups.get(stage) ?? { stage, count: 0, details: [] };
    g.count += 1;
    const d = cleanWarning(w);
    if (d && !g.details.includes(d)) g.details.push(d);
    groups.set(stage, g);
  }
  return [...groups.values()];
}

const FAILURE = /API error|model refused|output truncated|unparseable JSON|no output/i;

/** "AI step failed: facts, injuries ×5, synthesis" (or "AI notes: ..." when nothing actually failed). */
export function warningsSummary(warnings: string[]): string {
  if (!warnings.length) return "";
  const parts = groupWarnings(warnings).map((g) => (g.count > 1 ? `${g.stage} ×${g.count}` : g.stage));
  return `${warnings.some((w) => FAILURE.test(w)) ? "AI step failed" : "AI notes"}: ${parts.join(", ")}`;
}

// ---------- footer ----------
export function uniqueModels(models: Record<string, string>): string[] {
  return [...new Set(Object.values(models).filter(Boolean))];
}

export function footerLine(
  d: { version: number; meta: { builtAt: string; models: Record<string, string>; droppedRefs: number } },
  fmt: (d: string) => string,
): string {
  const models = uniqueModels(d.meta.models);
  const parts = [`Pipeline v${d.version}`, `built ${fmt(d.meta.builtAt)}`, models.join(", ") || "no AI"];
  if (d.meta.droppedRefs > 0) parts.push(`${d.meta.droppedRefs} unverifiable citation${d.meta.droppedRefs > 1 ? "s" : ""} dropped`);
  return parts.join(" · ");
}

/**
 * Coverage cap for the range bar.
 * Precedence:
 * 1. Explicit range cap
 * 2. Coverage KPI value
 * 3. Sum of non-exhausted liability layers: BI + Umbrella (each uses perPerson, falling back to perAccident)
 * 4. null (UI displays "cap unknown")
 */
export function resolveCap(
  rangeCap: number | null | undefined,
  coverageValue: number | null | undefined,
  layers: { kind: string; perPerson: number | null; perAccident?: number | null; exhausted?: boolean }[],
): number | null {
  const ok = (n: number | null | undefined): n is number => n != null && Number.isFinite(n) && n > 0;
  if (ok(rangeCap)) return rangeCap;
  if (ok(coverageValue)) return coverageValue;
  // Liability tower only: never UM/UIM, PIP, MedPay or liens.
  const sum = layers
    .filter((l) => (l.kind === "BI" || l.kind === "Umbrella") && !l.exhausted)
    .reduce((s, l) => s + (ok(l.perPerson) ? l.perPerson : ok(l.perAccident) ? l.perAccident : 0), 0);
  return sum > 0 ? sum : null;
}

// ---------- coverage bar ----------
export function coverageBarCaption(cap: number | null): string {
  return cap == null ? "cap unknown" : `Cap ${formatUsd(cap)}`;
}
