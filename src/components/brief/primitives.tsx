"use client";
import { useEffect, useState } from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SourceRef } from "@/lib/types";
import { SourceChip } from "@/components/evidence";
import { uniqueRefs } from "./lib";

export function Panel({ title, aside, className, children, id }: {
  title?: React.ReactNode; aside?: React.ReactNode; className?: string; children: React.ReactNode; id?: string;
}) {
  return (
    <section id={id} className={cn("min-w-0 rounded-xl border border-line bg-white p-4 sm:p-6", className)}>
      {(title || aside) && (
        <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          {title && <h2 className="font-serif text-[17px] font-semibold text-ink">{title}</h2>}
          {aside && <div className="text-xs text-ink-2">{aside}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/** All chips for a fact, deduped; shows "+N" past `max`. */
export function Refs({ refs, max = 3, className }: { refs: SourceRef[]; max?: number; className?: string }) {
  const list = uniqueRefs(refs);
  if (!list.length) return null;
  const shown = list.slice(0, max);
  const overflow = list.length - shown.length;
  const last = shown.length - 1;
  return (
    <span className={cn("inline-flex max-w-full flex-wrap items-center gap-1 align-middle", className)}>
      {shown.slice(0, last).map((r, i) => <SourceChip key={`${r.drawerKey}-${i}`} sourceRef={r} label={chipLabel(r)} />)}
      {/* the overflow count stays glued to the final chip so it never dangles on its own */}
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        <SourceChip key={`${shown[last].drawerKey}-${last}`} sourceRef={shown[last]} label={chipLabel(shown[last])} />
        {overflow > 0 && <span className="font-mono text-xs text-ink-2" title={`${overflow} more source${overflow > 1 ? "s" : ""}`}>+{overflow}</span>}
      </span>
    </span>
  );
}

/** One fact: its label first, then its chips, wrapping together as a unit. */
export function Fact({ label, refs, max = 1, className }: { label: React.ReactNode; refs: SourceRef[]; max?: number; className?: string }) {
  return (
    <span className={cn("inline-flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-1", className)}>
      <span className="min-w-0">{label}</span>
      <Refs refs={refs} max={max} />
    </span>
  );
}

const TYPE_LABEL: Record<SourceRef["sourceType"], string> = {
  matter: "Matter", custom_field: "Field", contact: "Contact", note: "Note", communication: "Comm",
  task: "Task", calendar_entry: "Calendar", expense: "Expense", document: "Doc",
};
/** "Note · 2026-09-20", "Doc p3". */
export function chipLabel(r: SourceRef): string {
  if (r.sourceType === "document" && r.page) return `Doc p${r.page}`;
  return r.sourceDate ? `${TYPE_LABEL[r.sourceType]} · ${r.sourceDate.slice(0, 10)}` : TYPE_LABEL[r.sourceType];
}

export type Tone = "danger" | "warn" | "info" | "ok" | "neutral" | "navy";
const TONE: Record<Tone, string> = {
  danger: "bg-danger-bg text-danger border-danger/20",
  warn: "bg-warn-bg text-warn border-warn/20",
  info: "bg-info-bg text-info border-info/20",
  ok: "bg-ok-bg text-ok border-ok/20",
  neutral: "bg-paper text-ink-2 border-line",
  navy: "bg-navy text-white border-navy",
};
export function Pill({ tone = "neutral", className, children, title }: {
  tone?: Tone; className?: string; children: React.ReactNode; title?: string;
}) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 max-w-full rounded-full border px-2 py-0.5 text-xs font-medium break-words whitespace-normal", TONE[tone], className)}>
      {children}
    </span>
  );
}

export function Avatar({ initials, url, size = 56 }: { initials: string; url: string | null; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-navy font-serif font-semibold text-white ring-1 ring-black/10 ring-inset"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt="" className="size-full object-cover" /> : initials}
    </div>
  );
}

export function Empty({ children, hint }: { children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-dashed border-line p-4 text-sm text-ink-2">
      <Inbox className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
      <div className="min-w-0 space-y-0.5">
        <p>{children}</p>
        {hint && <p className="text-xs text-ink-3">{hint}</p>}
      </div>
    </div>
  );
}

/** Persistent "changed since last view" marker; the word carries the meaning, the color is secondary. */
export function NewBadge({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded border border-new/30 bg-new-bg px-1.5 text-xs leading-5 font-semibold text-new", className)}>
      New
    </span>
  );
}

/** Client clock, null during SSR so server and client markup agree. */
export function useNow(intervalMs = 30_000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** "note:123" for any ref or change entry (document page suffixes stripped). */
export function itemKey(x: { sourceType: string; clioId: string }): string {
  return `${x.sourceType}:${x.clioId}`;
}
