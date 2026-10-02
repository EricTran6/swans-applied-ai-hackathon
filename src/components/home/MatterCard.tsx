"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Hourglass, Loader2, RefreshCw, Share2, Sparkles } from "lucide-react";
import type { SyncStatus } from "@/lib/types";
import type { MatterOverview, OverviewKpi } from "@/app/api/matters/overview/route";
import { cn } from "@/lib/utils";
import { formatUsdCompact, initialsOf } from "@/components/brief/lib";
import { Avatar, Pill, type Tone } from "@/components/brief/primitives";
import { RAIL_STEPS, attentionMeta, digestFooter, matterHref, miniValueBar, railIndex } from "./lib";
import { FOCUS } from "./TopBar";

const STATUS_TONE: Record<OverviewKpi["status"], string> = {
  danger: "text-danger", warn: "text-warn", ok: "text-ink", unknown: "text-ink-2",
};

function StageRail({ stageKey, label }: { stageKey: string; label: string }) {
  const idx = railIndex(stageKey);
  return (
    <div role="img" aria-label={`Stage ${idx + 1} of ${RAIL_STEPS.length}: ${label}`} className="flex items-center gap-1" title={`${RAIL_STEPS[idx]} · ${label}`}>
      {RAIL_STEPS.map((s, i) => (
        <span key={s} className={cn("h-1.5 flex-1 rounded-full", i < idx ? "bg-navy/60" : i === idx ? "bg-navy" : "bg-line")} />
      ))}
    </div>
  );
}

function MiniKpi({ label, children, title }: { label: string; children: React.ReactNode; title?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-paper/60 p-3" title={title}>
      <div className="text-[12px] font-medium uppercase tracking-wide text-ink-2">{label}</div>
      <div className="mt-1 min-w-0">{children}</div>
    </div>
  );
}

function ValueKpi({ value, coverage }: { value?: OverviewKpi; coverage?: OverviewKpi }) {
  const v = value?.value ?? null;
  const c = coverage?.value ?? null;
  const bar = miniValueBar(v, c);
  return (
    <MiniKpi label="Value vs coverage">
      <div className="flex flex-wrap items-baseline gap-x-1.5 text-[15px]">
        <span className="font-serif text-xl font-semibold text-ink tabular-nums">{v != null ? formatUsdCompact(v) : "—"}</span>
        <span className="text-ink-2">/ {c != null ? formatUsdCompact(c) : "no coverage on file"}</span>
      </div>
      {bar && (
        <div className="relative mt-2 h-2 rounded-full bg-line" aria-hidden>
          <div className={cn("absolute inset-y-0 left-0 rounded-full", bar.over ? "bg-warn/70" : "bg-navy/70")} style={{ width: `${bar.valuePct}%` }} />
          {bar.capPct != null && <div className="absolute -top-0.5 h-3 w-0.5 rounded bg-ink" style={{ left: `calc(${bar.capPct}% - 1px)` }} />}
        </div>
      )}
      {bar?.over && <div className="mt-1 text-[13px] text-warn">Review: value above coverage</div>}
    </MiniKpi>
  );
}

function TextKpi({ kpi, label }: { kpi?: OverviewKpi; label: string }) {
  const unknown = !kpi || kpi.status === "unknown";
  const tone = kpi ? STATUS_TONE[kpi.status] : "text-ink-2";
  return (
    <MiniKpi label={label} title={kpi?.display}>
      <div className={cn("flex items-start gap-1", unknown ? "text-sm" : "font-serif text-xl font-semibold leading-tight", tone)}>
        {kpi?.status === "danger" && <AlertTriangle className="mt-1 size-4 shrink-0" aria-hidden />}
        <span className="line-clamp-2 break-words">{kpi?.display ?? "Not recorded in Clio"}</span>
      </div>
      {kpi?.status === "danger" && <span className="sr-only">(overdue)</span>}
    </MiniKpi>
  );
}

function DigestNow({ matterId, onDone }: { matterId: string; onDone: () => void }) {
  const [state, setState] = useState<"idle" | "running" | "error">("idle");
  const [msg, setMsg] = useState<string>("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const poll = () => {
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/sync?matterId=${encodeURIComponent(matterId)}`, { cache: "no-store" });
        const s = (await res.json()) as SyncStatus;
        if (s.state === "error") { setState("error"); setMsg(s.message ?? "Digest failed"); return; }
        if (s.state === "idle" && s.lastDigestAt) { setState("idle"); setMsg("Digest ready"); onDone(); return; }
        setMsg(s.state === "digesting" ? "Digesting with AI…" : "Reading Clio (read-only)…");
        poll();
      } catch { setState("error"); setMsg("Lost contact with the server"); }
    }, 2500);
  };
  const start = async () => {
    setState("running"); setMsg("Starting…");
    try {
      const res = await fetch("/api/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ matterId }) });
      if (!res.ok) throw new Error(String(res.status));
      poll();
    } catch { setState("error"); setMsg("Could not start the digest"); }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={start} disabled={state === "running"}
        className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg bg-navy px-3 text-sm font-medium text-white disabled:opacity-70", FOCUS)}>
        {state === "running" ? <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden /> : state === "error" ? <RefreshCw className="size-4" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
        {state === "error" ? "Retry digest" : "Digest now"}
      </button>
      <span role="status" aria-live="polite" className={cn("text-[13px]", state === "error" ? "text-danger" : "text-ink-2")}>{msg}</span>
    </div>
  );
}

export function MatterCard({ data, hero, now, onRefresh }: { data: MatterOverview; hero: boolean; now: number | null; onRefresh: () => void }) {
  const { matter, digest, shares } = data;
  const kpi = (k: OverviewKpi["key"]) => digest?.kpis.find((x) => x.key === k);
  const href = matterHref(matter);
  const btn = cn("inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 py-1 text-sm font-medium", FOCUS);
  const fresh = digest?.newSinceOpen ?? null;
  const statusTone: Tone = matter.status === "Open" ? "ok" : "neutral";

  const header = (
    <div className="flex min-w-0 gap-4">
      <Avatar initials={initialsOf(matter.clientName)} url={null} size={hero ? 56 : 48} />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h3 className="min-w-0 break-words font-serif text-xl font-semibold leading-tight text-ink">
            <Link href={href} className={cn("rounded hover:underline underline-offset-4", FOCUS)}>{matter.clientName}</Link>
          </h3>
          <span className="font-mono text-[13px] text-ink-2">{matter.displayNumber}</span>
        </div>
        <p className="line-clamp-2 text-sm text-ink-2" title={matter.description}>{matter.description}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill tone={statusTone}>{matter.status}</Pill>
          {digest && <Pill tone="navy" title="Stage inferred from Clio records">{digest.stage.label}</Pill>}
          {fresh != null && fresh > 0 && <Pill tone="info"><Sparkles className="size-3" aria-hidden />{fresh} new since last open</Pill>}
          {fresh === 0 && <Pill tone="neutral">No changes since last open</Pill>}
          {digest && fresh == null && <Pill tone="neutral">Not opened yet</Pill>}
        </div>
        {digest && <StageRail stageKey={digest.stage.key} label={digest.stage.label} />}
      </div>
    </div>
  );

  const kpis = digest && (
    <div className={cn("grid grid-cols-2 gap-3", hero && "xl:grid-cols-4")}>
      <ValueKpi value={kpi("case_value")} coverage={kpi("coverage")} />
      <TextKpi kpi={kpi("specials")} label="Specials" />
      <TextKpi kpi={kpi("next_deadline")} label="Next deadline" />
      <TextKpi kpi={kpi("last_client_contact")} label="Last client contact" />
    </div>
  );

  const attention = !digest ? (
    <p className="text-sm text-ink-2">Run a digest to see value, deadlines and what needs attention. Clio is read once and the result is cached.</p>
  ) : (
    <div>
      <h4 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-ink-2">Needs attention</h4>
      {digest.topAttention.length === 0 ? (
        <p className="text-sm text-ink-2">Nothing overdue or waiting.</p>
      ) : (
        <ul className="space-y-2">
          {digest.topAttention.map((a, i) => {
            const late = a.kind === "overdue";
            const Icon = late ? AlertTriangle : Hourglass;
            return (
              <li key={`${a.drawerKey ?? a.title}-${i}`} className="flex gap-2.5">
                <Icon className={cn("mt-0.5 size-4 shrink-0", late ? "text-danger" : "text-info")} aria-hidden />
                <div className="min-w-0">
                  <p className="line-clamp-2 text-sm font-medium text-ink" title={a.title}>{a.title}</p>
                  <p className={cn("text-[13px]", late ? "text-danger" : "text-info")}>
                    <span className="sr-only">{late ? "Overdue: " : "Waiting: "}</span>{attentionMeta(a)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
      {digest ? (
        <span className="font-mono text-[12px] text-ink-2">{now != null ? digestFooter(digest, now) : `Digest v${digest.version}`}</span>
      ) : (
        <div className="flex flex-col gap-2">
          <span className="text-sm text-ink-2">Not digested yet</span>
          <DigestNow matterId={matter.clioId} onDone={onRefresh} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`${href}/share`} className={cn(btn, "border border-line text-navy hover:bg-paper")}>
          <Share2 className="size-4" aria-hidden /> Share with a provider
          {shares.total > 0 && <span className="text-ink-2">({shares.opened}/{shares.total} opened)</span>}
        </Link>
        <Link href={href} className={cn(btn, "bg-navy text-white hover:bg-navy/90")}>
          Open brief <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </div>
  );

  return (
    <article
      id={`matter-${matter.clioId}`}
      aria-label={`Matter ${matter.clientName}`}
      className={cn("flex min-w-0 flex-col gap-6 rounded-xl border border-line bg-white p-6", hero && "lg:col-span-2")}
    >
      {hero ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="flex min-w-0 flex-col gap-6">{header}{kpis}</div>
          <div className="min-w-0 lg:border-l lg:border-line lg:pl-6">{attention}</div>
        </div>
      ) : (
        <>{header}{kpis}{attention}</>
      )}
      {footer}
    </article>
  );
}
