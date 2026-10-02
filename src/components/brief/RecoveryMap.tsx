"use client";
import { useMemo, useState } from "react";
import type { Digest, SourceRef } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DEFAULT_CLIENT_TARGET_SHARE, DEFAULT_FEE_PCT, recoveryPlan } from "@/lib/digest/recovery";
import { formatUsd, recoveryInputs } from "./lib";
import { Empty, Panel, Refs } from "./primitives";

type Mode = "asBilled" | "negotiated";
interface Seg { key: string; label: string; amount: number; color: string; refs: SourceRef[] | null; note?: string; bold?: boolean }

const PROVIDER_SHADES = ["bg-danger", "bg-danger/80", "bg-danger/60", "bg-danger/45"];
const DEFAULT_FEE_DISPLAY = Math.round(DEFAULT_FEE_PCT * 1000) / 10;
const inputCls = "h-8 w-full rounded-lg border border-line bg-white px-2 text-sm tabular";

function Field({ label, caption, children }: { label: string; caption: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-ink-2">
      {label}
      {children}
      <span className="text-[11px] font-normal text-ink-3">{caption}</span>
    </label>
  );
}

export function RecoveryMap({ digest }: { digest: Digest }) {
  const inputs = useMemo(() => recoveryInputs(digest), [digest]);
  const cap = inputs?.cap ?? 0;
  const [settlementEdit, setSettlementEdit] = useState<number | null>(null);
  const [fee, setFee] = useState(DEFAULT_FEE_DISPLAY);
  const [targetEdit, setTargetEdit] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("asBilled");

  if (!inputs) {
    return <Panel title="Who gets paid"><Empty>Not enough recorded in Clio to estimate (needs coverage limits).</Empty></Panel>;
  }

  const settlement = Math.min(settlementEdit ?? cap, cap);
  const target = targetEdit ?? Math.round(DEFAULT_CLIENT_TARGET_SHARE * settlement);
  const plan = recoveryPlan({ settlement, feePct: fee / 100, target, costs: inputs.costs, liens: inputs.liens, providers: inputs.providers });
  const alloc = plan[mode];

  const segs: Seg[] = [
    { key: "fee", label: `Attorney fee (${fee}%)`, amount: plan.fee, color: "bg-navy", refs: null, note: "assumption" },
    ...(inputs.costs ? [{ key: "costs", label: inputs.costs.label, amount: plan.costsPaid, color: "bg-ink-3", refs: inputs.costs.refs }] : []),
    ...inputs.liens.map((l, i) => ({ key: `lien${i}`, label: l.label, amount: plan.liensPaidEach[i] ?? 0, color: "bg-warn", refs: l.refs })),
    ...alloc.providers.map((p, i) => ({
      key: `prov${i}`, label: p.label, amount: p.paid, color: PROVIDER_SHADES[i % PROVIDER_SHADES.length], refs: p.refs,
      note: p.paid < p.billed ? `paid ${formatUsd(p.paid)} of ${formatUsd(p.billed)} billed` : undefined,
    })),
    { key: "client", label: "Client nets", amount: alloc.client, color: "bg-ok", refs: null, bold: true },
  ];
  const pct = (n: number) => (plan.settlement > 0 ? (n / plan.settlement) * 100 : 0);

  return (
    <Panel title="Who gets paid" aside="attorney only · computed in code, no AI">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={`Settlement: ${formatUsd(settlement)}`} caption={<>Coverage cap {formatUsd(cap)} <Refs refs={inputs.capRefs} max={2} /></>}>
          <input type="range" min={0} max={cap} step={cap < 100_000 ? Math.max(1, cap / 100) : 1000} value={settlement}
            onChange={(e) => setSettlementEdit(Number(e.target.value))} className="w-full accent-navy" />
        </Field>
        <Field label="Attorney fee %" caption="Assumption: no fee field in Clio">
          <input type="number" min={0} max={50} step={0.1} value={fee}
            onChange={(e) => setFee(Math.min(50, Math.max(0, Number(e.target.value) || 0)))} className={inputCls} />
        </Field>
        <Field label="Client target ($)" caption="Rule-of-thirds default">
          <input type="number" min={0} step={100} value={target}
            onChange={(e) => setTargetEdit(Math.max(0, Number(e.target.value) || 0))} className={inputCls} />
        </Field>
        <div className="flex flex-col gap-1 text-xs font-medium text-ink-2">
          <span id="recovery-mode">Provider payment</span>
          <div className="inline-flex self-start rounded-lg border border-line bg-white p-0.5" role="group" aria-labelledby="recovery-mode">
            {([["asBilled", "As billed"], ["negotiated", "With reductions"]] as const).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={mode === k} onClick={() => setMode(k)}
                className={cn("h-7 rounded-md px-2.5 text-sm font-normal", mode === k ? "bg-navy text-white" : "text-ink-2 hover:bg-paper")}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {plan.shortfall > 0 ? (
        <div className="mt-3 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger" role="status">
          <p className="font-medium">Underwater by {formatUsd(plan.shortfall)}: fee, costs, liens and bills exceed this settlement.</p>
          {plan.reductionPct == null ? (
            <p className="text-xs">Even if providers waive everything, the client can&apos;t net {formatUsd(target)}.</p>
          ) : plan.reductionPct > 0 ? (
            <p className="text-xs">Providers need a {Math.ceil(plan.reductionPct * 100)}% uniform reduction for the client to net {formatUsd(target)}.</p>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-xs text-ok">Everyone is paid in full; client nets {formatUsd(alloc.client)}</p>
      )}

      <div className="mt-3 flex h-6 w-full overflow-hidden rounded bg-paper" role="img" aria-label="Settlement split">
        {segs.map((s) => (
          <div key={s.key} className={cn("h-full border-r border-white/60 last:border-r-0", s.color)}
            style={{ width: `${pct(s.amount)}%` }} title={`${s.label}: ${formatUsd(s.amount)}`} />
        ))}
      </div>

      <ul className="mt-3 space-y-1.5">
        {segs.map((s) => (
          <li key={s.key} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
            <span className={cn("size-2.5 shrink-0 rounded-full", s.color)} aria-hidden />
            <span className={cn("min-w-0 flex-1 break-words", s.bold ? "font-semibold text-ink" : "text-ink-2")}>
              {s.label}
              {s.note && <span className="ml-1.5 text-xs text-ink-3">{s.note}</span>}
            </span>
            <span className={cn("tabular", s.bold ? "font-semibold text-ink" : "text-ink")}>{formatUsd(s.amount)}</span>
            {s.refs && <Refs refs={s.refs} max={2} />}
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs text-ink-3">
        Illustrative, not a distribution statement. Liens paid before providers; providers share pro rata. Bills as recorded in Clio; prior no-fault payments not netted.
      </p>
    </Panel>
  );
}
