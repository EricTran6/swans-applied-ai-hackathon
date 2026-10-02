"use client";
import Link from "next/link";
import { CalendarClock, Check, ExternalLink, Phone, Mail, Share2, StickyNote } from "lucide-react";
import type { Digest } from "@/lib/types";
import { formatDate } from "./lib";
import { costLabel } from "./header-lib";
import { Avatar, Fact, Pill } from "./primitives";

const KIND_WORD: Record<string, string> = { Phone: "call", Email: "email", Note: "note" };

export function CostBadge({ meta }: { meta: Digest["meta"] }) {
  const models = [...new Set(Object.values(meta.models))].join(" · ");
  return (
    <Pill tone={meta.cached ? "ok" : "neutral"} title={models || undefined}>
      {meta.cached && <Check className="size-3" aria-hidden />}
      {costLabel(meta)}
    </Pill>
  );
}

export function BriefHeader({ digest, toolbar }: { digest: Digest; toolbar?: React.ReactNode }) {
  const { header, client, stage } = digest;
  const lc = client.lastContact;
  const KindIcon = lc?.kind === "Email" ? Mail : lc?.kind === "Phone" ? Phone : StickyNote;
  const contactTone = !lc ? "neutral" : lc.daysAgo > 30 ? "danger" : lc.daysAgo > 14 ? "warn" : "ok";

  return (
    <header className="brief-fade-up flex flex-col gap-4 rounded-xl border border-line bg-white p-4 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex min-w-0 gap-4">
        <Avatar initials={client.initials || header.clientInitials} url={client.avatarUrl} size={64} />
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="font-serif text-2xl font-semibold leading-tight sm:text-[28px]">
              {client.name || header.clientName}
              {client.age != null && <span className="font-normal text-ink-2">, {client.age}</span>}
            </h1>
            <span className="font-mono text-xs text-ink-2">{header.displayNumber}</span>
          </div>
          <p className="line-clamp-2 text-sm text-ink-2" title={header.description}>{header.description}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Pill tone={header.status === "Open" ? "ok" : "neutral"}>{header.status}</Pill>
            <Fact
              label={<Pill tone="navy" title="Stage inferred from Clio records">{stage.label}</Pill>}
              refs={stage.evidence}
              className="mr-2"
            />
            {header.incidentDate && (
              <Fact
                label={<span className="text-xs text-ink-2">DOI <span className="font-mono">{formatDate(header.incidentDate.value)}</span></span>}
                refs={[header.incidentDate]}
              />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {lc ? (
              <Fact
                className="mr-2"
                label={
                  <Pill tone={contactTone}>
                    <KindIcon className="size-3" aria-hidden />
                    Last spoke {lc.daysAgo === 0 ? "today" : `${lc.daysAgo} day${lc.daysAgo === 1 ? "" : "s"} ago`} ({KIND_WORD[lc.kind] ?? lc.kind.toLowerCase()})
                  </Pill>
                }
                refs={[lc.ref]}
              />
            ) : (
              <Pill tone="neutral">Last client contact not recorded in Clio</Pill>
            )}
            {client.nextTouchpoint && (
              <Fact
                label={
                  <span className="inline-flex items-center gap-1 text-xs text-ink-2">
                    <CalendarClock className="size-3.5 text-ink-3" aria-hidden />
                    <span className="line-clamp-2" title={client.nextTouchpoint.title}>
                      Next: {client.nextTouchpoint.title} · <span className="font-mono">{formatDate(client.nextTouchpoint.date, { year: false })}</span>
                    </span>
                  </span>
                }
                refs={[client.nextTouchpoint.ref]}
              />
            )}
          </div>
          {lc?.summary && <p className="line-clamp-2 text-xs text-ink-2" title={lc.summary}>“{lc.summary}”</p>}
          {client.statusChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {client.statusChips.map((c, i) => (
                <Fact key={`${c.text}-${i}`} label={<Pill tone="neutral">{c.text}</Pill>} refs={c.refs} />
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
        <div className="flex flex-wrap items-center gap-2">
          {header.matterUrl && (
            <a
              href={header.matterUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-sm text-navy hover:bg-paper"
            >
              Open in Clio <ExternalLink className="size-3.5" aria-hidden />
            </a>
          )}
          <Link
            href={`/matters/${encodeURIComponent(digest.matterId)}/share`}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-sm text-navy hover:bg-paper"
          >
            Share with provider <Share2 className="size-3.5" aria-hidden />
          </Link>
          {toolbar}
        </div>
        <CostBadge meta={digest.meta} />
      </div>
    </header>
  );
}
