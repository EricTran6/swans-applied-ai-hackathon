"use client";
import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CoverageLayer, Kpi, SourceRef } from "@/lib/types";
import { formatUsd, formatUsdCompact, rangeBarLayout } from "./lib";
import { coverageBarCaption, resolveCap } from "./header-lib";
import { Refs } from "./primitives";

const STATUS_TEXT: Record<Kpi["status"], string> = {
  ok: "text-ink", warn: "text-warn", danger: "text-danger", unknown: "text-ink-2",
};
const STATUS_DOT: Record<Kpi["status"], string> = {
  ok: "bg-ok", warn: "bg-warn", danger: "bg-danger", unknown: "bg-ink-2",
};

export function ConflictsPopover({ conflicts }: { conflicts: SourceRef[] }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-full border border-warn/30 bg-warn-bg px-2 py-0.5 text-xs font-medium text-warn focus-visible:outline-2"
      >
        <TriangleAlert className="size-3" aria-hidden /> {conflicts.length} conflicting source{conflicts.length > 1 ? "s" : ""}
      </button>
      {open && (
        <div role="dialog" className="absolute left-0 top-7 z-20 w-72 rounded-lg border border-line bg-white p-3 text-xs shadow-[0_8px_24px_rgb(20_24_31/.08)]">
          <p className="mb-2 text-ink-2">Other records say something different. Latest-dated source is shown above.</p>
          <ul className="space-y-2">
            {conflicts.map((c) => (
              <li key={c.drawerKey} className="flex flex-col gap-1">
                <span className="font-medium text-ink">{c.value}</span>
                {c.quote && <span className="text-ink-3">“{c.quote}”</span>}
                <Refs refs={[c]} max={1} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </span>
  );
}

function KpiValue({ kpi }: { kpi: Kpi }) {
  if (kpi.status === "unknown") return <div className="text-sm text-ink-2">Not recorded in Clio</div>;
  return <div className={cn("tabular text-2xl font-semibold leading-tight", STATUS_TEXT[kpi.status])}>{kpi.display}</div>;
}

function KpiTile({ kpi, children, className }: { kpi: Kpi; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2 rounded-xl border border-line bg-white p-4 sm:p-6", className)}>
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-2">
        <span className={cn("size-1.5 rounded-full", STATUS_DOT[kpi.status])} aria-hidden />
        {kpi.label}
      </div>
      <KpiValue kpi={kpi} />
      {children}
      {kpi.note && <p className="text-sm text-ink-2">{kpi.note}</p>}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        <Refs refs={kpi.refs} max={2} />
        {kpi.conflicts && kpi.conflicts.length > 0 && <ConflictsPopover conflicts={kpi.conflicts} />}
      </div>
    </div>
  );
}

/** 0 -> value with the coverage cap marked and the uncollectable gap hatched. */
export function RangeBar({ low, high, cap }: { low: number | null; high: number | null; cap: number | null }) {
  const l = rangeBarLayout({ low, high, cap });
  if (!l) return <p className="text-sm text-ink-2">{coverageBarCaption(null)}</p>;
  return (
    <div className="pt-1" role="img" aria-label={`Value ${formatUsd(high)}, ${cap == null ? "cap unknown" : `coverage cap ${formatUsd(cap)}`}`}>
      <div className="relative h-3 rounded-full bg-paper ring-1 ring-line ring-inset">
        <div className="absolute inset-y-0 left-0 rounded-full bg-navy/80" style={{ width: `${l.capPct != null && l.gap ? l.capPct : l.highPct}%` }} />
        {l.lowPct < l.highPct && (
          <div className="absolute inset-y-0 bg-navy/25" style={{ left: `${l.lowPct}%`, width: `${l.highPct - l.lowPct}%` }} title="Estimate range" />
        )}
        {l.gap && (
          <div
            className="absolute inset-y-0 rounded-r-full"
            style={{
              left: `${l.gap.fromPct}%`, width: `${l.gap.toPct - l.gap.fromPct}%`,
              background: "repeating-linear-gradient(135deg, var(--warn) 0 3px, var(--warn-bg) 3px 7px)",
            }}
            title={`Above coverage: ${formatUsd(l.gap.amount)}`}
          />
        )}
        {l.capPct != null && (
          <div className="absolute -top-1 -bottom-1 w-0.5 bg-ink" style={{ left: `calc(${l.capPct}% - 1px)` }} />
        )}
      </div>
      <div className="relative mt-1 h-4 font-mono text-xs text-ink-2">
        {l.ticks.map((t, i) => (
          <span
            key={t.pct}
            className="absolute"
            style={{ left: `${t.pct}%`, transform: i === 0 ? "none" : i === l.ticks.length - 1 ? "translateX(-100%)" : "translateX(-50%)" }}
          >
            {t.label}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-2">
        {l.capPct != null && <span><span className="mr-1 inline-block h-2.5 w-0.5 bg-ink align-middle" aria-hidden />Cap {formatUsdCompact(cap)}</span>}
        {l.capPct == null && <span className="inline-flex items-center gap-1"><TriangleAlert className="size-3" aria-hidden />{coverageBarCaption(null)}</span>}
        {l.gap && <span className="inline-flex items-center gap-1 text-warn"><TriangleAlert className="size-3" aria-hidden />Gap {formatUsdCompact(l.gap.amount)} above coverage</span>}
      </div>
    </div>
  );
}

export function CoverageLayers({ layers }: { layers: CoverageLayer[] }) {
  if (!layers.length) return <p className="text-sm text-ink-2">No coverage layers recorded in Clio</p>;
  return (
    <ul className="space-y-1">
      {layers.map((c, i) => (
        <li key={`${c.kind}-${i}`} className={cn("flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs", c.exhausted && "text-ink-2")}>
          <span className="w-20 shrink-0 font-medium text-ink-2">{c.kind}</span>
          <span className={cn("tabular", c.exhausted && "line-through")}>
            {c.perPerson != null ? formatUsdCompact(c.perPerson) : "—"}
            {c.perAccident != null && ` / ${formatUsdCompact(c.perAccident)}`}
          </span>
          {c.exhausted && <span className="text-xs uppercase text-danger">exhausted</span>}
          {c.carrier && <span className="truncate text-ink-2">{c.carrier}</span>}
          <Refs refs={c.refs} max={1} />
        </li>
      ))}
    </ul>
  );
}

const ORDER: Kpi["key"][] = ["case_value", "coverage", "specials", "firm_spend", "last_client_contact", "next_deadline"];

export function KpiRow({ kpis, coverage }: { kpis: Kpi[]; coverage: CoverageLayer[] }) {
  const byKey = new Map(kpis.map((k) => [k.key, k]));
  const value = byKey.get("case_value");
  const cov = byKey.get("coverage");
  const rest = ORDER.slice(2).map((k) => byKey.get(k)).filter((k): k is Kpi => !!k);
  const cap = resolveCap(value?.range?.cap, cov?.value, coverage);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {value && (
        <KpiTile kpi={value} className="sm:col-span-2">
          <RangeBar
            low={value.range?.low ?? null}
            high={value.range?.high ?? value.value}
            cap={cap}
          />
        </KpiTile>
      )}
      {cov && (
        <KpiTile kpi={cov} className="sm:col-span-2">
          <CoverageLayers layers={coverage} />
        </KpiTile>
      )}
      {rest.map((k) => <KpiTile key={k.key} kpi={k} />)}
    </div>
  );
}
