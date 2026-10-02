"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, FolderOpen, Plug } from "lucide-react";
import type { MattersOverviewResponse } from "@/app/api/matters/overview/route";
import { Skeleton } from "@/components/ui/skeleton";
import { MatterList } from "@/components/brief/MatterList";
import { useNow } from "@/components/brief/primitives";
import { cn } from "@/lib/utils";
import { activityFeed, gridMode, todayTiles } from "./lib";
import { HowItWorks } from "./HowItWorks";
import { MatterCard } from "./MatterCard";
import { ProviderActivity } from "./ProviderActivity";
import { TodayStrip } from "./TodayStrip";
import { FOCUS, TopBar, type ConnState } from "./TopBar";

type State =
  | { kind: "loading" }
  | { kind: "unauthenticated" }
  | { kind: "error" }
  | { kind: "ok"; data: MattersOverviewResponse };

const SK = "motion-reduce:animate-none bg-line/60";

function LoadingGrid() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <p role="status" className="sr-only">Loading matters…</p>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className={cn("h-[112px] rounded-xl", SK)} />)}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 min-[1600px]:grid-cols-3">
        {Array.from({ length: 2 }, (_, i) => <Skeleton key={i} className={cn("h-[420px] rounded-xl", SK)} />)}
      </div>
    </div>
  );
}

function ConnectCard() {
  return (
    <section className="flex flex-col items-start gap-4 rounded-xl border border-line bg-white p-8 sm:p-10">
      <span className="flex size-12 items-center justify-center rounded-full bg-paper text-navy ring-1 ring-line"><Plug className="size-5" aria-hidden /></span>
      <div>
        <h2 className="font-serif text-2xl font-semibold text-ink">Connect Clio to see your matters</h2>
        <p className="mt-1 max-w-prose text-[15px] text-ink-2">
          Case Lens reads your open matters from Clio, read-only, and digests each one into a cited brief. Nothing is written back.
        </p>
      </div>
      <Link href="/connect" className={cn("inline-flex h-10 items-center gap-2 rounded-lg bg-navy px-4 text-sm font-medium text-white hover:bg-navy/90", FOCUS)}>
        <Plug className="size-4" aria-hidden /> Connect Clio (read-only)
      </Link>
    </section>
  );
}

export function HomeDashboard({ firmName }: { firmName: string | null }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const now = useNow();

  const load = useCallback(async (): Promise<State> => {
    try {
      const res = await fetch("/api/matters/overview", { cache: "no-store" });
      if (res.status === 401) return { kind: "unauthenticated" };
      if (!res.ok) return { kind: "error" };
      return { kind: "ok", data: (await res.json()) as MattersOverviewResponse };
    } catch {
      return { kind: "error" };
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void load().then((s) => { if (alive) setState(s); });
    return () => { alive = false; };
  }, [load]);

  const refresh = useCallback(() => { void load().then(setState); }, [load]);

  const conn: ConnState = state.kind === "loading" ? "checking" : state.kind === "unauthenticated" ? "disconnected" : state.kind === "ok" ? "connected" : "unknown";
  const matters = useMemo(() => (state.kind === "ok" ? state.data.matters : []), [state]);
  const tiles = useMemo(() => todayTiles(matters), [matters]);
  const feed = useMemo(() => activityFeed(matters), [matters]);
  const mode = gridMode(matters.length);

  let main: React.ReactNode;
  if (state.kind === "loading") main = <LoadingGrid />;
  else if (state.kind === "unauthenticated") main = <ConnectCard />;
  else if (state.kind === "error") {
    main = (
      <section className="flex flex-col gap-3">
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-warn/25 bg-warn-bg p-4 text-sm text-warn">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>Review: the dashboard summary could not load, so this is the plain matter list.</span>
        </p>
        <MatterList />
      </section>
    );
  } else if (matters.length === 0) {
    main = (
      <section className="flex flex-col items-start gap-3 rounded-xl border border-line bg-white p-8 sm:p-10">
        <span className="flex size-12 items-center justify-center rounded-full bg-paper text-ink-2 ring-1 ring-line"><FolderOpen className="size-5" aria-hidden /></span>
        <h2 className="font-serif text-xl font-semibold text-ink">No open matters</h2>
        <p className="max-w-prose text-[15px] text-ink-2">Clio returned no open matters for this account. Open a matter in Clio, then reload this page.</p>
      </section>
    );
  } else {
    main = (
      <div className="flex flex-col gap-6">
        <TodayStrip tiles={tiles} />
        <section aria-labelledby="matters-h">
          <h2 id="matters-h" className="mb-3 font-serif text-xl font-semibold text-ink">
            Matters <span className="font-sans text-sm font-normal text-ink-2">({matters.length} open)</span>
          </h2>
          <div className={cn("grid grid-cols-1 gap-6 lg:grid-cols-2", mode === "grid" && "min-[1600px]:grid-cols-3")}>
            {matters.map((m) => <MatterCard key={m.matter.clioId} data={m} hero={mode === "hero"} now={now} onRefresh={refresh} />)}
          </div>
        </section>
      </div>
    );
  }

  const showRail = state.kind === "ok" && matters.length > 0;
  return (
    <main id="main" tabIndex={-1} className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-6 sm:px-6">
      <h1 className="sr-only">Matters dashboard</h1>
      <TopBar firmName={firmName} conn={conn} />
      <div className={cn("grid grid-cols-1 gap-6", showRail && "xl:grid-cols-[minmax(0,1fr)_340px]")}>
        <div className="min-w-0">{main}</div>
        {showRail && <aside className="min-w-0 xl:pt-[40px]"><ProviderActivity feed={feed} now={now} /></aside>}
      </div>
      <HowItWorks />
    </main>
  );
}
