"use client";
import type { ProviderView } from "@/lib/types";
import { STAGES, fmtDate, fmtMoney, stageIndex } from "./logic";
import { Needs } from "./needs";

const card = "rounded-xl border bg-card p-4";
const h2 = "text-base font-semibold";

function StatusRail({ view }: { view: ProviderView }) {
  const cur = stageIndex(view.stage.label);
  const { status } = view;
  const parts = [status.label];
  if (status.lastFirmActivity) parts.push(`last firm activity ${fmtDate(status.lastFirmActivity)}`);
  if (status.nextEvent) parts.push(`next event ${fmtDate(status.nextEvent)}`);
  return (
    <section aria-label="Case status" className={card}>
      <ol className="flex items-start">
        {STAGES.map((s, i) => (
          <li key={s} className="flex flex-1 flex-col items-center text-center" aria-current={i === cur ? "step" : undefined}>
            <span className={`h-3 w-3 rounded-full ${i < cur ? "bg-primary/50" : i === cur ? "bg-primary ring-4 ring-primary/20" : "bg-muted"}`} />
            <span className={`mt-1 text-xs leading-tight ${i === cur ? "font-semibold" : "text-muted-foreground"}`}>{s}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-sm">
        <span className={view.status.alive === "stalled" ? "font-semibold text-amber-700" : "font-semibold"}>{parts[0]}</span>
        {parts.slice(1).map((p) => ` · ${p}`)}
      </p>
    </section>
  );
}

export function ProviderViewCard({ view, token }: { view: ProviderView; token?: string }) {
  const cov = view.coverage;
  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-xl space-y-4 bg-background p-4 text-foreground">
      <header>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{view.firmName}</p>
        <h1 className="text-xl font-semibold">Case update for {view.recipientLabel}</h1>
        <p className="text-sm text-muted-foreground">Patient: {view.clientDisplayName}</p>
      </header>

      {view.attorneyNote && (
        <section className={`${card} bg-muted/40`} aria-label="Note from the attorney">
          <p className="text-sm whitespace-pre-line">{view.attorneyNote}</p>
          <p className="mt-1 text-xs text-muted-foreground">Note from {view.firmName}</p>
        </section>
      )}

      <StatusRail view={view} />

      {cov && (
        <div className={`${card} flex flex-wrap items-center gap-2`}>
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${cov.confirmed ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
            {cov.confirmed ? `Coverage confirmed in writing${cov.confirmedOn ? ` ${fmtDate(cov.confirmedOn)}` : ""}` : "Coverage not yet confirmed"}
          </span>
          {cov.layers && cov.layers.length > 0 && (
            <span className="text-sm text-muted-foreground">
              {cov.layers.map((l) => `${l.kind}: ${l.limit}`).join(" · ")}
            </span>
          )}
        </div>
      )}

      <Needs needs={view.needs} token={token} />

      {view.bill && (
        <section className={card} aria-labelledby="bill-h">
          <h2 id="bill-h" className={h2}>Your bill on file</h2>
          <p className="mt-1 text-2xl font-semibold">{fmtMoney(view.bill.amount)}</p>
          {view.bill.servicesThrough && <p className="text-sm text-muted-foreground">Services through {fmtDate(view.bill.servicesThrough)}</p>}
          {view.bill.stale && (
            <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900" role="note">
              This may be out of date{view.bill.servicesThrough ? ` (services through ${fmtDate(view.bill.servicesThrough)})` : ""}. Please send an updated ledger.
            </p>
          )}
        </section>
      )}

      {view.appointments.length > 0 && (
        <section className={card} aria-labelledby="appt-h">
          <h2 id="appt-h" className={h2}>Upcoming appointments</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {view.appointments.map((a, i) => (
              <li key={i} className="flex justify-between gap-2"><span>{a.title}</span><span className="text-muted-foreground">{fmtDate(a.date)}</span></li>
            ))}
          </ul>
        </section>
      )}

      {view.records.length > 0 && (
        <section className={card} aria-labelledby="rec-h">
          <h2 id="rec-h" className={h2}>Records on file</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {view.records.map((r, i) => (
              <li key={i} className="flex justify-between gap-2"><span>{r.name}</span><span className="text-muted-foreground">{fmtDate(r.date)}</span></li>
            ))}
          </ul>
        </section>
      )}

      {view.updates.length > 0 && (
        <section className={card} aria-labelledby="upd-h">
          <h2 id="upd-h" className={h2}>Updates</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {view.updates.map((u, i) => (
              <li key={i}><span className="text-xs text-muted-foreground">{fmtDate(u.date)}</span><br />{u.text}</li>
            ))}
          </ul>
        </section>
      )}

      {view.careTeam && view.careTeam.length > 0 && (
        <section className={card} aria-labelledby="team-h">
          <h2 id="team-h" className={h2}>Care team</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {view.careTeam.map((c, i) => (
              <li key={i}>{c.name} <span className="text-muted-foreground">· {c.role}</span></li>
            ))}
          </ul>
        </section>
      )}

      {view.findings && view.findings.length > 0 && (
        <section className={card} aria-labelledby="find-h">
          <h2 id="find-h" className={h2}>Findings</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {view.findings.map((f, i) => (
              <li key={i}>{f.text}<br /><span className="text-xs text-muted-foreground">{f.source}</span></li>
            ))}
          </ul>
        </section>
      )}

      <footer className="pb-6 text-xs text-muted-foreground">
        <p>Case strategy and other providers&apos; information are not shared.</p>
        <p className="mt-1">Shared {fmtDate(view.sharedAt)} · link expires {fmtDate(view.expiresAt)}</p>
      </footer>
    </main>
  );
}
