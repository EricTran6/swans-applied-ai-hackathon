"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, Lock, ShieldAlert, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import type { ShareCandidate, ShareSummary } from "@/lib/types";
import { httpApi, providerOptions, type BuilderApi, type CaseData, type ProviderOption } from "./api";
import {
  counts, groupByCategory, isLocked, lockReason, openedLabel, previewSections,
  sanitize, setCategory, sharedIds, toggleCandidate,
} from "./logic";

export function ShareBuilder({ matterId, api = httpApi }: { matterId: string; api?: BuilderApi }) {
  const [data, setData] = useState<CaseData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<ProviderOption | null>(null);
  const [candidates, setCandidates] = useState<ShareCandidate[]>([]);
  const [otherOptIn, setOtherOptIn] = useState(false);
  const [coverageLimits, setCoverageLimits] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [shares, setShares] = useState<ShareSummary[]>([]);

  useEffect(() => {
    api.loadCase(matterId).then((d) => { setData(d); setShares(d.shares); }).catch((e) => setError(String(e.message ?? e)));
  }, [api, matterId]);

  const providers = useMemo(() => (data ? providerOptions(data) : []), [data]);

  async function pick(p: ProviderOption) {
    setProvider(p); setLink(null); setCandidates([]); setOtherOptIn(false); setCoverageLimits(false); setError(null); setBusy(true);
    try {
      const res = await api.draft({ matterId, recipientLabel: p.name, recipientContactId: p.contactId ?? undefined });
      setCandidates(sanitize(res.candidates));
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const c = counts(candidates);
  const groups = groupByCategory(candidates);
  const sections = previewSections(candidates);

  const send = useCallback(async () => {
    if (!provider) return;
    setBusy(true); setError(null);
    try {
      const res = await api.send({
        matterId, recipientLabel: provider.name, recipientContactId: provider.contactId ?? undefined,
        includedIds: sharedIds(candidates, { coverageLimits }), attorneyNote: note.trim() || undefined,
      });
      setLink(res.url);
      setShares(await api.listShares(matterId));
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }, [api, matterId, provider, candidates, coverageLimits, note]);

  async function revoke(id: string) {
    try { await api.revoke(id); setShares(await api.listShares(matterId)); } catch (e) { setError((e as Error).message); }
  }

  async function copy() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* manual copy */ }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 pb-28">
      <header>
        <h1 className="text-2xl font-semibold">Share with a provider</h1>
        <p className="text-sm text-muted-foreground">Choose what a treating provider sees. Strategy, valuation and notes are never shared.</p>
      </header>
      {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      <section aria-label="Provider" className="space-y-2">
        <h2 className="text-sm font-medium">1. Provider</h2>
        {!data ? <p className="text-sm text-muted-foreground">Loading...</p> : providers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No treating providers found on this matter.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {providers.map((p) => (
              <Button key={`${p.contactId}-${p.name}`} variant={provider?.name === p.name ? "default" : "outline"} onClick={() => pick(p)}>
                {p.name}{p.role ? <span className="ml-2 text-xs opacity-70">{p.role}</span> : null}
              </Button>
            ))}
          </div>
        )}
      </section>

      {provider && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section aria-label="Checklist" className="space-y-4">
            <h2 className="text-sm font-medium">2. What to include</h2>
            {busy && candidates.length === 0 && <p className="text-sm text-muted-foreground">Preparing draft...</p>}
            {groups.map((g) => {
              const optInGate = g.category === "other_records" && !otherOptIn;
              return (
                <div key={g.category} className="rounded-lg border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold">{g.label}</h3>
                    {g.category === "other_records" && (
                      <label className="flex items-center gap-2 text-xs">
                        Include other providers&apos; records
                        <Switch checked={otherOptIn} onCheckedChange={(on) => {
                          setOtherOptIn(on);
                          if (!on) setCandidates((l) => setCategory(l, "other_records", false));
                        }} />
                      </label>
                    )}
                    {g.category === "coverage" && (
                      <label className="flex items-center gap-2 text-xs">
                        Show coverage limits
                        <Switch checked={coverageLimits} onCheckedChange={setCoverageLimits} />
                      </label>
                    )}
                  </div>
                  <ul className="space-y-2">
                    {g.items.map((it) => {
                      const locked = isLocked(it);
                      const disabled = locked || optInGate;
                      const reason = lockReason(it);
                      return (
                        <li key={it.id} className="flex items-start gap-3 text-sm">
                          {locked ? <Lock aria-label="Locked" className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : (
                            <Checkbox aria-label={it.label} checked={it.included} disabled={disabled}
                              onCheckedChange={() => setCandidates((l) => toggleCandidate(l, it.id))} />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className={locked ? "text-muted-foreground" : ""}>{it.label}</div>
                            <div className="truncate text-xs text-muted-foreground">{it.preview}</div>
                            {locked && reason && <div className="text-xs text-muted-foreground">Locked: {reason}</div>}
                            {!locked && it.flag && it.flag.level !== "ok" && (
                              <Badge variant={it.flag.level === "block" ? "destructive" : "secondary"} className="mt-1 h-auto whitespace-normal">
                                {it.flag.level === "review" ? <TriangleAlert /> : <ShieldAlert />}
                                {it.flag.level}: {it.flag.reason}
                              </Badge>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
            <div>
              <label htmlFor="attorney-note" className="text-sm font-medium">3. Note to {provider.name}</label>
              <textarea id="attorney-note" value={note} onChange={(e) => setNote(e.target.value)} rows={4}
                className="mt-1 w-full rounded-md border bg-background p-2 text-sm" placeholder="Optional message the provider will see" />
            </div>
          </section>

          <section aria-label="Preview" className="space-y-3">
            <h2 className="text-sm font-medium">What {provider.name} will see</h2>
            <div className="space-y-3 rounded-lg border bg-muted/30 p-4 text-sm" data-testid="preview">
              {note.trim() && <blockquote className="border-l-2 pl-3 italic">{note.trim()}</blockquote>}
              {sections.length === 0 && <p className="text-muted-foreground">Nothing selected yet.</p>}
              {sections.map((s) => (
                <div key={s.category}>
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground">{s.label}</h3>
                  <ul className="list-disc pl-5">{s.items.map((i) => <li key={i.id}>{i.preview}</li>)}</ul>
                </div>
              ))}
              {coverageLimits && <p className="text-xs text-muted-foreground">Coverage limits will be shown.</p>}
            </div>
          </section>
        </div>
      )}

      {link && (
        <div role="status" className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
          <p className="font-medium">Link created. It is shown only once, so copy it now.</p>
          <div className="mt-2 flex items-center gap-2">
            <input readOnly value={link} aria-label="Share link" className="min-w-0 flex-1 rounded-md border bg-background p-2 text-xs" onFocus={(e) => e.currentTarget.select()} />
            <Button onClick={copy} variant="outline">{copied ? <Check /> : <Copy />}{copied ? "Copied" : "Copy"}</Button>
          </div>
        </div>
      )}

      <section aria-label="Share history" className="space-y-2">
        <h2 className="text-sm font-medium">Share history</h2>
        {shares.length === 0 && <p className="text-sm text-muted-foreground">Nothing shared yet.</p>}
        <ul className="space-y-2">
          {shares.map((s) => {
            const revoked = !!s.revokedAt;
            return (
              <li key={s.shareId} className="rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{s.recipientLabel}</span>
                  {revoked ? <Badge variant="destructive">Revoked</Badge> : <Badge variant="secondary">{openedLabel(s.views, s.lastViewedAt)}</Badge>}
                  <span className="text-xs text-muted-foreground">{s.sharedCount} shared / {s.withheldCount} withheld</span>
                  {!revoked && <Button size="sm" variant="outline" className="ml-auto" onClick={() => revoke(s.shareId)}>Revoke</Button>}
                </div>
                {s.responses.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {s.responses.map((r) => (
                      <li key={r.id}>
                        {r.kind === "sent" ? "Sent" : r.kind === "will_send" ? `Will send${r.promisedDate ? ` by ${r.promisedDate}` : ""}` : "Note"}
                        {r.text ? `: ${r.text}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {provider && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 p-3 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <span className="text-sm font-medium" data-testid="counter">{c.shared} shared / {c.withheld} withheld</span>
            <Button onClick={send} disabled={busy || c.shared === 0 || !!link}>Send to {provider.name}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
