"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LoaderCircle, RefreshCw } from "lucide-react";
import type { ChangeEntry, Digest, Matter, ShareSummary, SyncStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { relativeTime } from "./lib";
import { BriefView } from "./BriefView";
import { BriefSkeleton } from "./BriefSkeleton";
import { useNow } from "./primitives";

interface CaseResponse {
  matter: Matter | null;
  digest: Digest | null;
  sinceLastOpen: ChangeEntry[];
  lastOpenedAt: string | null;
  shares?: ShareSummary[];
}

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new HttpError(res.status, body?.error ?? `${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

const POLL_MS = 1500;
const BUSY: SyncStatus["state"][] = ["syncing", "digesting"];

export function MatterBrief({ matterId }: { matterId: string }) {
  const [data, setData] = useState<CaseResponse | null>(null);
  const [error, setError] = useState<HttpError | null>(null);
  const [loading, setLoading] = useState(true);
  const [since, setSince] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const now = useNow(30_000);

  const loadCase = useCallback(async (sinceParam: string | null) => {
    const qs = new URLSearchParams({ matterId });
    if (sinceParam) qs.set("since", sinceParam);
    try {
      setData(await getJson<CaseResponse>(`/api/case?${qs}`));
      setError(null);
    } catch (e) {
      setError(e instanceof HttpError ? e : new HttpError(0, String(e)));
    } finally {
      setLoading(false);
    }
  }, [matterId]);

  const poll = useCallback(async () => {
    try {
      const s = await getJson<SyncStatus>(`/api/sync?matterId=${encodeURIComponent(matterId)}`);
      setSync(s);
      if (BUSY.includes(s.state)) {
        pollRef.current = setTimeout(poll, POLL_MS);
      } else {
        if (s.state === "error") setSyncError(s.message ?? "Sync failed");
        await loadCase(since);
      }
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : String(e));
    }
  }, [matterId, loadCase, since]);

  useEffect(() => {
    void loadCase(null);
    getJson<SyncStatus>(`/api/sync?matterId=${encodeURIComponent(matterId)}`)
      .then((s) => {
        setSync(s);
        if (BUSY.includes(s.state)) pollRef.current = setTimeout(poll, POLL_MS);
      })
      .catch(() => { /* status is optional on first paint */ });
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per matter
  }, [matterId]);

  const refresh = async () => {
    setSyncError(null);
    try {
      await getJson<unknown>("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matterId }),
      });
      setSync((s) => ({ matterId, lastSyncedAt: s?.lastSyncedAt ?? null, lastDigestAt: s?.lastDigestAt ?? null, state: "syncing", message: "Starting…" }));
      if (pollRef.current) clearTimeout(pollRef.current);
      pollRef.current = setTimeout(poll, 500);
    } catch (e) {
      setSyncError(e instanceof HttpError && e.status === 401 ? "Clio session expired. Reconnect." : e instanceof Error ? e.message : String(e));
    }
  };

  const compare = (s: string | null) => {
    setSince(s);
    void loadCase(s);
  };

  // Record this open once per page load (after the first successful load, so the viewer cookie exists).
  // The changes already on screen stay visible; the next open is diffed from now.
  const openRecorded = useRef(false);
  const hasDigest = !!data?.digest;
  useEffect(() => {
    if (!hasDigest || openRecorded.current) return;
    openRecorded.current = true;
    void fetch("/api/view-state", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ matterId }),
    }).catch(() => null);
  }, [hasDigest, matterId]);

  const markSeen = async () => {
    await fetch("/api/view-state", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ matterId }),
    }).catch(() => null);
    setData((d) => (d ? { ...d, sinceLastOpen: [], lastOpenedAt: new Date().toISOString() } : d));
  };

  const busy = !!sync && BUSY.includes(sync.state);
  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={refresh}
        disabled={busy}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-lg bg-navy px-3 text-sm text-white hover:bg-navy/90 disabled:opacity-70",
        )}
      >
        {busy ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <RefreshCw className="size-3.5" aria-hidden />}
        {busy ? (sync?.state === "digesting" ? "Digesting…" : "Syncing…") : "Refresh"}
      </button>
      <span className="text-xs text-ink-3" aria-live="polite">
        {busy && sync?.message ? sync.message : `Last synced ${now ? relativeTime(sync?.lastSyncedAt ?? null, now) : "…"}`}
      </span>
      {busy && (
        <span className="relative h-1 w-20 overflow-hidden rounded-full bg-line" aria-hidden>
          <span className={cn("absolute inset-y-0 left-0 rounded-full bg-navy transition-all", sync?.state === "digesting" ? "w-2/3" : "w-1/3 animate-pulse")} />
        </span>
      )}
      {syncError && (
        <span className="text-xs text-danger">
          {syncError}{" "}
          {/expired|reconnect|401/i.test(syncError) && <Link href="/connect" className="underline">Connect Clio</Link>}
        </span>
      )}
    </div>
  );

  if (loading) return <BriefSkeleton />;

  const notSynced = error?.status === 404 && /not synced/i.test(error.message);

  if (error && !notSynced) {
    return (
      <StateCard title={error.status === 404 ? "Matter not found" : "Could not load this matter"}>
        <p>{error.status === 401 ? "Connect your Clio account to load matters." : error.message}</p>
        <div className="flex gap-2">
          {error.status === 401 ? (
            <Link href="/connect" className="rounded-lg bg-navy px-3 py-1.5 text-sm text-white">Connect Clio</Link>
          ) : (
            <button type="button" onClick={() => { setLoading(true); void loadCase(since); }} className="rounded-lg bg-navy px-3 py-1.5 text-sm text-white">Retry</button>
          )}
          <Link href="/" className="rounded-lg border border-line px-3 py-1.5 text-sm">All matters</Link>
        </div>
      </StateCard>
    );
  }

  if (notSynced || !data?.digest) {
    return (
      <StateCard title={data?.matter ? data.matter.description || data.matter.displayNumber : "No brief yet"}>
        <p>This matter has not been digested yet. Refresh pulls it from Clio (read-only) and builds the brief once; later opens are served from cache.</p>
        {toolbar}
      </StateCard>
    );
  }

  return (
    <BriefView
      digest={data.digest}
      sinceLastOpen={data.sinceLastOpen ?? []}
      lastOpenedAt={data.lastOpenedAt}
      toolbar={toolbar}
      onCompareSince={compare}
      compareSince={since}
      onMarkSeen={markSeen}
      onRefresh={refresh}
    />
  );
}

export function StateCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto mt-16 flex max-w-lg flex-col gap-3 rounded-xl border border-line bg-white p-6 text-sm text-ink-2">
      <h1 className="font-serif text-xl font-semibold text-ink">{title}</h1>
      {children}
    </div>
  );
}
