"use client";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { SourceRef } from "@/lib/types";
import { SourceChip } from "@/components/evidence";
import { uniqueRefs } from "./lib";

export function Panel({ title, aside, className, children, id }: {
  title?: React.ReactNode; aside?: React.ReactNode; className?: string; children: React.ReactNode; id?: string;
}) {
  return (
    <section id={id} className={cn("min-w-0 rounded-xl border border-line bg-white p-4 sm:p-5", className)}>
      {(title || aside) && (
        <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          {title && <h2 className="font-serif text-[17px] font-semibold text-ink">{title}</h2>}
          {aside && <div className="text-xs text-ink-3">{aside}</div>}
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
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1 align-middle", className)}>
      {shown.map((r) => <SourceChip key={r.drawerKey} sourceRef={r} label={chipLabel(r)} />)}
      {list.length > max && <span className="font-mono text-[11px] text-ink-3">+{list.length - max}</span>}
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
    <span title={title} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", TONE[tone], className)}>
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

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-3 text-sm text-ink-3">{children}</p>;
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
