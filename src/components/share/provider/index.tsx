"use client";
import { Check, CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import type { ProviderView } from "@/lib/types";
import { STAGES, fmtDate, fmtMoney, stageIndex } from "./logic";
import { Needs } from "./needs";
import { ProviderShell } from "./shell";

const card = "rounded-xl border border-line bg-white p-4";
const h2 = "font-serif text-lg font-semibold text-ink";
const meta = "text-ink-3";

function stageDot(i: number, cur: number) {
  if (i < cur) {
    return (
      <span className="relative z-10 flex size-5 items-center justify-center rounded-full bg-navy text-white">
        <Check aria-hidden className="size-3" strokeWidth={3} />
      </span>
    );
  }
  if (i === cur) {
    return <span className="relative z-10 size-6 rounded-full border-4 border-white bg-navy ring-2 ring-navy" />;
  }
  return <span className="relative z-10 size-5 rounded-full border-2 border-ink-3 bg-white" />;
}

function StatusRail({ view }: { view: ProviderView }) {
  const cur = stageIndex(view.stage.label);
  const { status } = view;
  const stalled = status.alive === "stalled";
  const parts: string[] = [];
  if (status.lastFirmActivity) parts.push(`Last firm activity ${fmtDate(status.lastFirmActivity)}`);
  if (status.nextEvent) parts.push(`Next event ${fmtDate(status.nextEvent)}`);
  return (
    <section aria-labelledby="status-h" className={card}>
      <h2 id="status-h" className={h2}>Case status</h2>
      <ol className="mt-4 flex items-start">
        {STAGES.map((s, i) => {
          const state = i < cur ? "completed" : i === cur ? "current" : "upcoming";
          return (
            <li key={s} className="relative flex flex-1 flex-col items-center text-center" aria-current={i === cur ? "step" : undefined}>
              {i > 0 && (
                <span aria-hidden className={`absolute top-3 right-1/2 h-0.5 w-full -translate-y-1/2 ${i <= cur ? "bg-navy" : "bg-line"}`} />
              )}
              <span className="flex h-6 items-center">{stageDot(i, cur)}</span>
              <span className={`mt-1.5 px-0.5 text-xs leading-tight ${i === cur ? "font-semibold text-ink" : i < cur ? "text-ink-2" : meta}`}>
                {s}
                <span className="sr-only"> ({state})</span>
              </span>
              {i === cur && (
                <span aria-hidden className="mt-1 rounded-full bg-navy px-1.5 py-px text-[11px] font-semibold uppercase tracking-wide text-white">Current</span>
              )}
            </li>
          );
        })}
      </ol>
      <div className="mt-4 border-t border-line pt-3 text-sm">
        <p className={`flex items-center gap-1.5 font-semibold ${stalled ? "text-warn" : "text-ink"}`}>
          {stalled && <TriangleAlert aria-hidden className="size-4 shrink-0" />}
          {stalled && <span className="sr-only">Attention: </span>}
          {status.label}
        </p>
        {parts.length > 0 && <p className="mt-0.5 text-ink-2">{parts.join(" · ")}</p>}
      </div>
    </section>
  );
}

function CoveragePill({ cov }: { cov: NonNullable<ProviderView["coverage"]> }) {
  const Icon = cov.confirmed ? CircleCheck : CircleAlert;
  return (
    <div className={`${card} flex flex-wrap items-center gap-2`}>
      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${cov.confirmed ? "bg-ok-bg text-ok" : "bg-warn-bg text-warn"}`}>
        <Icon aria-hidden className="size-4 shrink-0" />
        {cov.confirmed ? `Coverage confirmed in writing${cov.confirmedOn ? ` ${fmtDate(cov.confirmedOn)}` : ""}` : "Coverage not yet confirmed"}
      </span>
      {cov.layers && cov.layers.length > 0 && (
        <span className="tabular text-sm text-ink-2">{cov.layers.map((l) => `${l.kind}: ${l.limit}`).join(" · ")}</span>
      )}
    </div>
  );
}

function DatedList({ id, title, items }: { id: string; title: string; items: { label: string; date: string | null }[] }) {
  if (items.length === 0) return null;
  return (
    <section className={card} aria-labelledby={id}>
      <h2 id={id} className={h2}>{title}</h2>
      <ul className="mt-2 divide-y divide-line text-sm">
        {items.map((it, i) => (
          <li key={i} className="flex justify-between gap-3 py-2">
            <span className="min-w-0 text-ink">{it.label}</span>
            <span className={`tabular shrink-0 ${meta}`}>{fmtDate(it.date)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ProviderViewCard({ view, token, embedded = false }: { view: ProviderView; token?: string; embedded?: boolean }) {
  const cov = view.coverage;
  return (
    <ProviderShell firmName={view.firmName} embedded={embedded}>
      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-ink-3">{view.firmName}</p>
        <h1 className="mt-1 font-serif text-2xl font-semibold text-ink">Case update for {view.recipientLabel}</h1>
        <p className="mt-0.5 text-sm text-ink-2">Patient: {view.clientDisplayName}</p>
      </header>

      {view.attorneyNote && (
        <section className="rounded-xl border border-line border-l-4 border-l-navy bg-white p-4" aria-label="Note from the attorney">
          <p className="text-sm whitespace-pre-line text-ink">{view.attorneyNote}</p>
          <p className={`mt-2 text-xs ${meta}`}>Note from {view.firmName}</p>
        </section>
      )}

      <StatusRail view={view} />

      {cov && <CoveragePill cov={cov} />}

      <Needs needs={view.needs} token={token} />

      {view.bill && (
        <section className={card} aria-labelledby="bill-h">
          <h2 id="bill-h" className={h2}>Your bill on file</h2>
          <p className="tabular mt-1 text-3xl font-semibold text-ink">{fmtMoney(view.bill.amount)}</p>
          {view.bill.servicesThrough && <p className="text-sm text-ink-2">Services through {fmtDate(view.bill.servicesThrough)}</p>}
          {view.bill.stale && (
            <p className="mt-3 flex gap-2 rounded-lg border border-warn/30 bg-warn-bg p-3 text-sm text-warn" role="note">
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                This may be out of date{view.bill.servicesThrough ? ` (services through ${fmtDate(view.bill.servicesThrough)})` : ""}. Please send an updated ledger.
              </span>
            </p>
          )}
        </section>
      )}

      <DatedList id="appt-h" title="Upcoming appointments" items={view.appointments.map((a) => ({ label: a.title, date: a.date }))} />
      <DatedList id="rec-h" title="Records on file" items={view.records.map((r) => ({ label: r.name, date: r.date }))} />

      {view.updates.length > 0 && (
        <section className={card} aria-labelledby="upd-h">
          <h2 id="upd-h" className={h2}>Updates</h2>
          <ul className="mt-2 space-y-3 text-sm">
            {view.updates.map((u, i) => (
              <li key={i}>
                <span className={`tabular block text-xs ${meta}`}>{fmtDate(u.date)}</span>
                <span className="text-ink">{u.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {view.careTeam && view.careTeam.length > 0 && (
        <section className={card} aria-labelledby="team-h">
          <h2 id="team-h" className={h2}>Care team</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {view.careTeam.map((c, i) => (
              <li key={i} className="text-ink">{c.name} <span className="text-ink-2">· {c.role}</span></li>
            ))}
          </ul>
        </section>
      )}

      {view.findings && view.findings.length > 0 && (
        <section className={card} aria-labelledby="find-h">
          <h2 id="find-h" className={h2}>Findings</h2>
          <ul className="mt-2 space-y-3 text-sm">
            {view.findings.map((f, i) => (
              <li key={i}>
                <span className="text-ink">{f.text}</span>
                <span className={`block text-xs ${meta}`}>{f.source}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="border-t border-line pt-3 pb-6 text-xs text-ink-3">
        <p>Case strategy and other providers&apos; information are not shared.</p>
        <p className="tabular mt-1">Shared {fmtDate(view.sharedAt)} · link expires {fmtDate(view.expiresAt)}</p>
      </footer>
    </ProviderShell>
  );
}
