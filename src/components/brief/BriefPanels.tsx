"use client";
import { useState } from "react";
import { ChevronDown, RefreshCw, TriangleAlert } from "lucide-react";
import type { Claim, ProviderBill, WaterfallStep } from "@/lib/types";
import { cn } from "@/lib/utils";
import { billBars, formatDate, formatUsd, waterfallLayout } from "./lib";
import { groupWarnings, warningsSummary } from "./header-lib";
import { Empty, Panel, Refs } from "./primitives";

/** One-line grouped warning summary, details behind a disclosure, and a Refresh call to action. */
export function WarningsBanner({ warnings, onRefresh }: { warnings: string[]; onRefresh?: () => void }) {
  const [open, setOpen] = useState(false);
  if (!warnings.length) return null;
  const groups = groupWarnings(warnings);
  return (
    <div className="rounded-lg border border-warn/30 bg-warn-bg px-4 py-3 text-sm text-warn" role="status">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex min-w-0 items-center gap-2 font-medium">
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          {warningsSummary(warnings)}
        </span>
        <span className="text-ink-2">Some sections may be missing.</span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="warnings-details"
          className="inline-flex min-h-6 cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-xs underline-offset-2 hover:underline focus-visible:outline-2"
        >
          Details <ChevronDown className={cn("size-3.5 transition-transform motion-reduce:transition-none", open && "rotate-180")} aria-hidden />
        </button>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="ml-auto inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-navy px-3 text-sm font-medium text-white hover:bg-navy/90 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <RefreshCw className="size-3.5" aria-hidden /> Refresh
          </button>
        )}
      </div>
      {open && (
        <ul id="warnings-details" className="mt-2 list-disc space-y-0.5 pl-9 text-xs text-ink-2">
          {groups.flatMap((g) => g.details.map((d) => <li key={`${g.stage}-${d}`}>{g.count > 1 ? `${d} (×${g.count})` : d}</li>))}
        </ul>
      )}
    </div>
  );
}

/** AI brief: every sentence carries its chips; claims without refs are never rendered. */
export function CitedBrief({ brief, openQuestions }: { brief: Claim[]; openQuestions: Claim[] }) {
  const claims = brief.filter((c) => c.refs.length > 0);
  const questions = openQuestions.filter((c) => c.refs.length > 0);
  return (
    <Panel title="Brief" aside="AI-written · every sentence cited">
      {claims.length === 0 ? (
        <Empty hint="Every sentence will carry a source chip you can open.">No brief yet. Refresh to digest this matter.</Empty>
      ) : (
        <p className="font-serif text-[17px] leading-relaxed text-ink">
          {claims.map((c, i) => (
            <span key={i} className="brief-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
              {c.text} <Refs refs={c.refs} max={2} />{" "}
            </span>
          ))}
        </p>
      )}
      {questions.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-2">Open questions</h3>
          <ul className="space-y-1 text-sm text-ink-2">
            {questions.map((q, i) => (
              <li key={i}>{q.text} <Refs refs={q.refs} max={1} /></li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

/** Cap -> liens -> costs -> before fees, as floating horizontal bars. */
export function Waterfall({ steps }: { steps: WaterfallStep[] }) {
  const bars = waterfallLayout(steps);
  return (
    <Panel title="What reaches the client" aside="before attorney fees">
      {bars.length === 0 ? (
        <Empty>Nothing to chart yet: needs coverage limits (and a case value) recorded in Clio.</Empty>
      ) : (
        <ul className="space-y-2.5">
          {bars.map((b, i) => (
            <li key={i} className="grid grid-cols-[minmax(0,7.5rem)_1fr] items-center gap-3 sm:grid-cols-[9rem_1fr]">
              <div className="min-w-0">
                <div className={cn("truncate text-xs", b.step.kind === "result" ? "font-semibold text-ink" : "text-ink-2")}>{b.step.label}</div>
                <div className={cn("tabular text-sm", b.step.kind === "minus" ? "text-danger" : "font-semibold text-ink")}>
                  {b.step.kind === "minus" ? `−${formatUsd(Math.abs(b.step.amount))}` : formatUsd(b.step.amount)}
                </div>
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <div className="relative h-5 rounded bg-paper">
                  <div
                    className={cn(
                      "absolute inset-y-0 rounded",
                      b.step.kind === "start" && "bg-navy/80",
                      b.step.kind === "minus" && "bg-danger/70",
                      b.step.kind === "result" && "bg-ok",
                    )}
                    style={{ left: `${b.fromPct}%`, width: `${Math.max(0.6, b.toPct - b.fromPct)}%` }}
                  />
                </div>
                <Refs refs={b.step.refs} max={2} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** Specials by provider (attorney view only). */
export function ProviderBills({ bills }: { bills: ProviderBill[] }) {
  const bars = billBars(bills);
  const total = bills.reduce((s, b) => s + b.amount, 0);
  return (
    <Panel title="Provider bills" aside={bills.length ? `Specials ${formatUsd(total)} · ${bills.length} providers` : undefined}>
      {bars.length === 0 ? (
        <Empty>No provider bills recorded in Clio.</Empty>
      ) : (
        <ul className="space-y-2.5">
          {bars.map(({ bill, pct }, i) => (
            <li key={`${bill.providerName}-${i}`} className="space-y-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <span className="min-w-0 truncate text-ink">{bill.providerName}</span>
                <span className="tabular font-semibold">{formatUsd(bill.amount)}</span>
              </div>
              <div className="h-2.5 rounded-full bg-paper">
                <div className="h-full rounded-full bg-navy/70" style={{ width: `${pct}%` }} />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-ink-2">
                {bill.servicesThrough && <span>services through {formatDate(bill.servicesThrough)}</span>}
                <Refs refs={bill.refs} max={2} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
