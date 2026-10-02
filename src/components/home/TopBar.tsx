"use client";
import Link from "next/link";
import { CheckCircle2, Loader2, PlugZap } from "lucide-react";
import { cn } from "@/lib/utils";

export type ConnState = "checking" | "connected" | "disconnected" | "unknown";

export const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy";

export function ConnectionPill({ state }: { state: ConnState }) {
  const base = cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium", FOCUS);
  if (state === "connected") {
    return (
      <Link href="/connect" className={cn(base, "border-ok/25 bg-ok-bg text-ok")} title="Clio connection (read-only)">
        <CheckCircle2 className="size-4" aria-hidden /> Clio connected · read-only
      </Link>
    );
  }
  if (state === "disconnected") {
    return (
      <Link href="/connect" className={cn(base, "border-danger/25 bg-danger-bg text-danger")}>
        <PlugZap className="size-4" aria-hidden /> Clio not connected · Connect
      </Link>
    );
  }
  return (
    <Link href="/connect" className={cn(base, "border-line bg-white text-ink-2")}>
      {state === "checking" && <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />}
      {state === "checking" ? "Checking Clio…" : "Clio connection"}
    </Link>
  );
}

export function TopBar({ firmName, conn }: { firmName: string | null; conn: ConnState }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-serif text-2xl font-semibold text-ink">Case Lens</span>
        {firmName && <span className="truncate text-sm text-ink-2">{firmName}</span>}
      </div>
      <ConnectionPill state={conn} />
    </header>
  );
}
