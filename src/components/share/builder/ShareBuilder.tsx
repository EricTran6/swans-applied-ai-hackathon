"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, ChevronRight, Copy, Lock, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { ProviderViewCard } from "@/components/share/provider";
import type { ProviderView, ShareCandidate, ShareSummary } from "@/lib/types";
import { httpApi, providerOptions, type BuilderApi, type CaseData, type ProviderOption } from "./api";
import {
  builderSections, canSend, counts, isLocked, lockedSummary, lockReason, openedLabel, othersSummary,
  sanitize, setCategory, sharedIds, toggleCandidate, type BuilderSection, type RecipientId,
} from "./logic";

const PREVIEW_DEBOUNCE_MS = 300;
const meta = "text-xs text-ink-2";
const smallCaps = "text-xs font-medium uppercase tracking-wide text-ink-2";
const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2";
const checkbox = `mt-0.5 border-ink-3 data-checked:border-navy data-checked:bg-navy data-checked:text-primary-foreground ${focusRing}`;

function Disclosure({ id, open, onToggle, children }: { id: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-expanded={open} aria-controls={id} onClick={onToggle}
      className={`flex w-full items-center gap-2 rounded-md py-1 text-left text-sm text-ink-2 hover:text-foreground ${focusRing}`}>
      <ChevronRight aria-hidden className={`size-4 shrink-0 motion-safe:transition-transform ${open ? "rotate-90" : ""}`} />
      {children}
    </button>
  );
}

function AuditList({ id, items, rid }: { id: string; items: ShareCandidate[]; rid: RecipientId }) {
  return (
    <ul id={id} className="mt-2 space-y-1 border-l pl-4">
      {items.map((it) => (
        <li key={it.id} className="text-xs text-ink-2">
          <span className="line-clamp-2" title={it.label}>{it.label}</span>
          <span className="sr-only">: {lockReason(it, rid)}</span>
        </li>
      ))}
    </ul>
  );
}

function LockedRow({ s, open, onToggle, rid }: { s: BuilderSection; open: boolean; onToggle: () => void; rid: RecipientId }) {
  const id = `locked-${s.category}`;
  return (
    <div className="rounded-lg border bg-card px-4 py-2">
      <Disclosure id={id} open={open} onToggle={onToggle}>
        <Lock aria-hidden className="size-4 shrink-0" />
        <span>{lockedSummary(s)}</span>
      </Disclosure>
      {open && <AuditList id={id} items={s.lockedItems} rid={rid} />}
    </div>
  );
}

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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [view, setView] = useState<ProviderView | null>(null);
  const [previewState, setPreviewState] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    api.loadCase(matterId).then((d) => { setData(d); setShares(d.shares); }).catch((e) => setError(String(e.message ?? e)));
  }, [api, matterId]);

  const providers = useMemo(() => (data ? providerOptions(data) : []), [data]);
  const rid: RecipientId = provider?.contactId ?? null;

  async function pick(p: ProviderOption) {
    setProvider(p); setLink(null); setCandidates([]); setOtherOptIn(false); setCoverageLimits(false); setError(null);
    setExpanded({}); setView(null); setBusy(true);
    try {
      const res = await api.draft({ matterId, recipientLabel: p.name, recipientContactId: p.contactId ?? undefined });
      setCandidates(sanitize(res.candidates, p.contactId ?? null));
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  // Live preview: exactly what the provider will see, rebuilt server-side (no persistence) 300 ms after each change.
  useEffect(() => {
    if (!provider || candidates.length === 0) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setPreviewState("loading");
      try {
        const v = await api.preview({
          matterId, recipientLabel: provider.name, recipientContactId: provider.contactId ?? undefined,
          includedIds: sharedIds(candidates, provider.contactId ?? null, { coverageLimits: false }),
          attorneyNote: note.trim() || undefined, coverageLimits,
        });
        if (!cancelled) { setView(v); setPreviewState("idle"); }
      } catch { if (!cancelled) setPreviewState("error"); }
    }, PREVIEW_DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(t); };
  }, [api, matterId, provider, candidates, coverageLimits, note]);

  const c = counts(candidates, rid);
  const sections = builderSections(candidates, rid);
  const toggle = (key: string) => setExpanded((e) => ({ ...e, [key]: !e[key] }));

  const send = useCallback(async () => {
    if (!provider) return;
    setBusy(true); setError(null);
    try {
      const res = await api.send({
        matterId, recipientLabel: provider.name, recipientContactId: provider.contactId ?? undefined,
        includedIds: sharedIds(candidates, provider.contactId ?? null, { coverageLimits }), attorneyNote: note.trim() || undefined,
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
        <h1 className="font-heading text-2xl font-semibold">Share with a provider</h1>
        <p className="text-sm text-ink-2">Choose what a treating provider sees. Strategy, valuation and notes are never shared.</p>
      </header>
      {error && <p role="alert" className="rounded-md border border-danger/40 bg-danger-bg p-3 text-sm text-danger">{error}</p>}

      <section aria-labelledby="pick-provider" className="space-y-2">
        <h2 id="pick-provider" className={smallCaps}>1. Provider</h2>
        {!data ? <p className="text-sm text-ink-2">Loading...</p> : providers.length === 0 ? (
          <p className="text-sm text-ink-2">No treating providers found on this matter.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {providers.map((p) => {
              const selected = provider?.name === p.name && provider?.contactId === p.contactId;
              return (
                <Button key={`${p.contactId}-${p.name}`} variant="outline" aria-pressed={selected} onClick={() => pick(p)}
                  className={`h-9 ${focusRing} ${selected ? "border-navy bg-navy text-primary-foreground hover:bg-navy/90 hover:text-primary-foreground" : ""}`}>
                  {selected && <Check aria-hidden />}
                  {p.name}{p.role ? <span className="ml-1 text-xs opacity-80">{p.role}</span> : null}
                </Button>
              );
            })}
          </div>
        )}
      </section>

      {provider && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section aria-labelledby="what-to-include" className="space-y-4">
            <h2 id="what-to-include" className={smallCaps}>2. What to include</h2>
            {busy && candidates.length === 0 && <p className="text-sm text-ink-2">Preparing draft...</p>}
            {sections.map((s) => {
              if (s.locked) {
                const key = `${s.category}:locked`;
                return <LockedRow key={s.category} s={s} rid={rid} open={!!expanded[key]} onToggle={() => toggle(key)} />;
              }
              const optInGate = s.category === "other_records" && !otherOptIn;
              const othersKey = `${s.category}:others`;
              return (
                <div key={s.category} className="rounded-lg border bg-card p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-heading text-base font-semibold">{s.label}</h3>
                    {s.category === "other_records" && (
                      <label className="flex items-center gap-2 text-xs text-ink-2">
                        Include other providers&apos; records
                        <Switch className={focusRing} checked={otherOptIn} onCheckedChange={(on) => {
                          setOtherOptIn(on);
                          if (!on) setCandidates((l) => setCategory(l, "other_records", false, rid));
                        }} />
                      </label>
                    )}
                    {s.category === "coverage" && (
                      <label className="flex items-center gap-2 text-xs text-ink-2">
                        Show coverage limits
                        <Switch className={focusRing} checked={coverageLimits} onCheckedChange={setCoverageLimits} />
                      </label>
                    )}
                  </div>
                  {s.items.length === 0 && <p className={meta}>Nothing for {provider.name} here.</p>}
                  <ul className="space-y-3">
                    {s.items.map((it) => {
                      const locked = isLocked(it, rid);
                      const reason = lockReason(it, rid);
                      const inputId = `cand-${it.id}`;
                      return (
                        <li key={it.id} className="flex items-start gap-3 text-sm">
                          {locked ? <Lock aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-2" /> : (
                            <Checkbox id={inputId} className={checkbox} checked={it.included} disabled={optInGate}
                              onCheckedChange={() => setCandidates((l) => toggleCandidate(l, it.id, rid))} />
                          )}
                          <div className="min-w-0 flex-1">
                            <label htmlFor={locked ? undefined : inputId} title={it.label}
                              className={`line-clamp-2 ${locked ? "text-ink-2" : "cursor-pointer"}`}>{it.label}</label>
                            {it.preview !== it.label && <div className={`line-clamp-2 ${meta}`} title={it.preview}>{it.preview}</div>}
                            {locked && reason && <div className={meta}>Locked: {reason}</div>}
                            {!locked && it.flag && it.flag.level === "review" && (
                              <Badge variant="secondary" className="mt-1 h-auto whitespace-normal bg-warn-bg text-warn">
                                <TriangleAlert aria-hidden />Review: {it.flag.reason}
                              </Badge>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {s.hiddenCompleted > 0 && (
                    <p className={`mt-3 ${meta}`}>{s.hiddenCompleted} completed {s.hiddenCompleted === 1 ? "request" : "requests"} hidden (withheld)</p>
                  )}
                  {s.others.length > 0 && (
                    <div className="mt-3 border-t pt-2">
                      <Disclosure id={`others-${s.category}`} open={!!expanded[othersKey]} onToggle={() => toggle(othersKey)}>
                        <Lock aria-hidden className="size-4 shrink-0" />
                        <span>{othersSummary(s.others.length)}</span>
                      </Disclosure>
                      {expanded[othersKey] && <AuditList id={`others-${s.category}`} items={s.others} rid={rid} />}
                    </div>
                  )}
                </div>
              );
            })}
            <div>
              <label htmlFor="attorney-note" className={smallCaps}>3. Note to {provider.name}</label>
              <textarea id="attorney-note" value={note} onChange={(e) => setNote(e.target.value)} rows={4} maxLength={1000}
                className={`mt-2 w-full rounded-md border bg-background p-2 text-sm ${focusRing}`} placeholder="Optional message the provider will see" />
            </div>
          </section>

          <section aria-labelledby="preview-title" className="space-y-3 lg:sticky lg:top-4 lg:self-start">
            <div className="flex items-center justify-between gap-2">
              <h2 id="preview-title" className={smallCaps}>What {provider.name} will see</h2>
              <span aria-live="polite" className={meta}>
                {previewState === "loading" ? "Updating..." : previewState === "error" ? "Preview unavailable" : ""}
              </span>
            </div>
            <div className="rounded-lg border bg-muted/30" data-testid="preview">
              {view ? <ProviderViewCard view={view} /> : (
                <p className="p-4 text-sm text-ink-2">{c.shared === 0 ? "Nothing selected yet." : "Building preview..."}</p>
              )}
            </div>
          </section>
        </div>
      )}

      {link && (
        <div role="status" className="rounded-lg border border-navy/40 bg-info-bg p-4 text-sm">
          <p className="font-medium">Link created. It is shown only once, so copy it now.</p>
          <div className="mt-2 flex items-center gap-2">
            <input readOnly value={link} aria-label="Share link" className={`min-w-0 flex-1 rounded-md border bg-background p-2 text-xs ${focusRing}`} onFocus={(e) => e.currentTarget.select()} />
            <Button onClick={copy} variant="outline" className={focusRing}>{copied ? <Check /> : <Copy />}{copied ? "Copied" : "Copy"}</Button>
          </div>
        </div>
      )}

      <section aria-labelledby="share-history" className="space-y-2">
        <h2 id="share-history" className={smallCaps}>Share history</h2>
        {shares.length === 0 && <p className="text-sm text-ink-2">Nothing shared yet.</p>}
        <ul className="space-y-2">
          {shares.map((s) => {
            const revoked = !!s.revokedAt;
            return (
              <li key={s.shareId} className="rounded-lg border bg-card p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{s.recipientLabel}</span>
                  {revoked ? <Badge variant="destructive">Revoked</Badge> : <Badge variant="secondary">{openedLabel(s.views, s.lastViewedAt)}</Badge>}
                  <span className={meta}>{s.sharedCount} shared / {s.withheldCount} withheld</span>
                  {!revoked && <Button size="sm" variant="outline" className={`ml-auto ${focusRing}`} onClick={() => revoke(s.shareId)}>Revoke</Button>}
                </div>
                {s.responses.length > 0 && (
                  <ul className={`mt-2 space-y-1 ${meta}`}>
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
        <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 p-4 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <span className="text-sm font-medium" data-testid="counter" aria-live="polite">{c.shared} shared / {c.withheld} withheld</span>
            <Button onClick={send} disabled={!canSend({ shared: c.shared, link, busy })}
              className={`h-9 bg-navy text-primary-foreground hover:bg-navy/90 ${focusRing}`}>Send to {provider.name}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
