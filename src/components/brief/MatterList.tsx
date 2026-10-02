"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, FolderOpen, Plug } from "lucide-react";
import type { MatterSummary } from "@/lib/types";
import { initialsOf } from "./lib";
import { Avatar, Pill } from "./primitives";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy";

type State =
  | { kind: "loading" }
  | { kind: "unauthenticated" }
  | { kind: "error"; message: string }
  | { kind: "ok"; matters: MatterSummary[] };

export function MatterList() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    fetch("/api/matters", { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401) return { kind: "unauthenticated" } as const;
        const body = (await res.json().catch(() => null)) as { matters?: MatterSummary[]; error?: string } | null;
        if (!res.ok) return { kind: "error", message: body?.error ?? `${res.status} ${res.statusText}` } as const;
        return { kind: "ok", matters: body?.matters ?? [] } as const;
      })
      .catch((e: unknown) => ({ kind: "error", message: e instanceof Error ? e.message : String(e) }) as const)
      .then((s) => { if (alive) setState(s); });
    return () => { alive = false; };
  }, []);

  if (state.kind === "loading") {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-busy="true">
        <p role="status" className="sr-only">Loading matters…</p>
        {Array.from({ length: 4 }, (_, i) => <div key={i} aria-hidden className="h-24 rounded-xl bg-line/60 motion-safe:animate-pulse" />)}
      </div>
    );
  }
  if (state.kind === "unauthenticated" || (state.kind === "error" && /clio|token|auth/i.test(state.message))) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-line bg-white p-6">
        <p className="flex items-center gap-2 text-sm text-ink-2"><Plug className="size-4 shrink-0 text-navy" aria-hidden />Connect your Clio account (read-only) to see your matters.</p>
        <Link href="/connect" className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-navy px-4 text-sm font-medium text-white hover:bg-navy/90 ${FOCUS}`}>
          <Plug className="size-4" aria-hidden /> Connect Clio
        </Link>
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <p role="alert" className="flex items-start gap-2 rounded-xl border border-danger/20 bg-danger-bg p-4 text-sm text-danger">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span className="min-w-0 break-words">Could not load matters: {state.message}</span>
      </p>
    );
  }
  if (state.matters.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-line bg-white p-6 text-sm text-ink-2">
        <FolderOpen className="size-4 shrink-0 text-ink-3" aria-hidden />No open matters found in Clio.
      </p>
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {state.matters.map((m) => (
        <li key={m.clioId}>
          <Link
            href={`/matters/${encodeURIComponent(m.clioId)}`}
            className={`group flex min-w-0 items-center gap-4 rounded-xl border border-line bg-white p-4 transition-colors hover:border-navy/40 ${FOCUS}`}
          >
            <Avatar initials={initialsOf(m.clientName)} url={null} size={44} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-serif text-[17px] font-semibold text-ink">{m.clientName}</span>
                <span className="font-mono text-xs text-ink-3">{m.displayNumber}</span>
              </div>
              <p className="truncate text-sm text-ink-2">{m.description}</p>
            </div>
            <Pill tone={m.status === "Open" ? "ok" : "neutral"}>{m.status}</Pill>
            <ArrowRight className="size-4 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
