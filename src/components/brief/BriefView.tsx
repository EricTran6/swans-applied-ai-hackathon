"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { BellDot, CheckCheck, ChevronDown, History, Layers, ListTree } from "lucide-react";
import type { ChangeEntry, Digest } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useEvidence } from "@/components/evidence";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDate } from "./lib";
import { BriefHeader } from "./Header";
import { KpiRow } from "./KpiRow";
import { CitedBrief, ProviderBills, WarningsBanner } from "./BriefPanels";
import { RecoveryMap } from "./RecoveryMap";
import { footerLine } from "./header-lib";
import { StoryStrip } from "./StoryStrip";
import { ActionBoard, TopTen } from "./TopTenAndActions";
import { EverythingTable, Injuries } from "./InjuriesAndTable";
import { itemKey } from "./primitives";

export interface BriefViewProps {
  digest: Digest;
  sinceLastOpen: ChangeEntry[];
  lastOpenedAt: string | null;
  /** Refresh / sync controls rendered in the header. */
  toolbar?: React.ReactNode;
  /** Server-side compare (GET /api/case?since=). Without it, the digest's changeFeed is filtered locally. */
  onCompareSince?: (since: string | null) => void;
  compareSince?: string | null;
  onMarkSeen?: () => void;
  /** Re-run sync + digest; shown as the warnings banner call to action. */
  onRefresh?: () => void;
}

export function BriefView({ digest, sinceLastOpen, lastOpenedAt, toolbar, onCompareSince, compareSince, onMarkSeen, onRefresh }: BriefViewProps) {
  const [onlyNew, setOnlyNew] = useState(false);
  const [depth, setDepth] = useState<"brief" | "everything">("brief");
  const [localSince, setLocalSince] = useState<string | null>(null);
  const everythingRef = useRef<HTMLDivElement>(null);

  const since = onCompareSince ? compareSince ?? null : localSince;
  const changes = useMemo(() => {
    if (onCompareSince || !localSince) return sinceLastOpen;
    return digest.changeFeed.filter((c) => c.detectedAt.slice(0, 10) >= localSince);
  }, [onCompareSince, localSince, sinceLastOpen, digest.changeFeed]);
  const newKeys = useMemo(() => new Set(changes.map(itemKey)), [changes]);

  useEffect(() => {
    if (depth === "everything") everythingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [depth]);

  const setSince = (v: string | null) => (onCompareSince ? onCompareSince(v) : setLocalSince(v));

  return (
    <main id="main" tabIndex={-1} className="mx-auto flex w-full max-w-[1360px] flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6">
      <BriefHeader digest={digest} toolbar={toolbar} />

      <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center gap-2 border-b border-line bg-paper/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
        <Popover>
          <PopoverTrigger
            disabled={changes.length === 0}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm",
              changes.length === 0 ? "border-line text-ink-2" : cn("cursor-pointer font-medium", onlyNew ? "border-new bg-new text-white" : "border-new/30 bg-new-bg text-new hover:border-new/60"),
            )}
          >
            <span aria-hidden className={cn("size-2 rounded-full", changes.length ? (onlyNew ? "bg-white" : "bg-new") : "bg-ink-3")} />
            <span className="tabular">{changes.length}</span> {since ? `changed since ${formatDate(since)}` : "new since last view"}
            {!since && lastOpenedAt && <span className="hidden text-xs opacity-75 sm:inline">({formatDate(lastOpenedAt)})</span>}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-96 max-w-[calc(100vw-2rem)]">
            <ChangeList changes={changes} onlyNew={onlyNew} onToggleOnlyNew={() => setOnlyNew((v) => !v)} />
          </PopoverContent>
        </Popover>
        <label className="inline-flex items-center gap-1.5 text-sm text-ink-2">
          <History className="size-4 text-ink-2" aria-hidden />
          <span className="hidden sm:inline">Compare since</span>
          <input
            type="date"
            value={since ?? ""}
            onChange={(e) => setSince(e.target.value || null)}
            className="h-8 cursor-pointer rounded-lg border border-line bg-white px-2 text-sm"
            aria-label="Compare since date"
          />
        </label>
        <div className="ml-auto inline-flex rounded-lg border border-line bg-white p-0.5" role="group" aria-label="Depth">
          {([["brief", "2-min brief", Layers], ["everything", "Everything", ListTree]] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              aria-pressed={depth === key}
              onClick={() => setDepth(key)}
              className={cn("inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-sm", depth === key ? "bg-navy text-white" : "text-ink-2 hover:bg-paper")}
            >
              <Icon className="size-3.5" aria-hidden /> {label}
            </button>
          ))}
        </div>
      </div>

      <ChangesBanner
        changes={changes}
        since={since ?? lastOpenedAt}
        isCompare={!!since}
        onlyNew={onlyNew}
        onToggleOnlyNew={() => setOnlyNew((v) => !v)}
        onMarkSeen={onMarkSeen && !since ? onMarkSeen : undefined}
      />

      <WarningsBanner warnings={digest.meta.warnings} onRefresh={onRefresh} />

      <KpiRow kpis={digest.kpis} coverage={digest.coverage} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]">
        <RecoveryMap digest={digest} />
        <CitedBrief brief={digest.brief} openQuestions={digest.openQuestions} />
      </div>

      <StoryStrip timeline={digest.timeline} newKeys={newKeys} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]">
        <TopTen items={digest.topTen} total={digest.totalItems} newKeys={newKeys} onlyNew={onlyNew} />
        <ActionBoard board={digest.actionBoard} sol={digest.header.sol} />
      </div>

      <Injuries injuries={digest.injuries} />
      <ProviderBills bills={digest.providerBills} />

      <div ref={everythingRef} className="scroll-mt-16">
        {depth === "everything" ? (
          <EverythingTable timeline={digest.timeline} newKeys={newKeys} onlyNew={onlyNew} />
        ) : (
          <button
            type="button"
            onClick={() => setDepth("everything")}
            className="min-h-11 w-full cursor-pointer rounded-xl border border-dashed border-line py-3 text-sm text-ink-2 hover:border-ink-3/40 hover:bg-white hover:text-ink focus-visible:outline-2"
          >
            Show everything: all {digest.timeline.length} timeline events, sortable and filterable
          </button>
        )}
      </div>

      <footer className="pb-6 text-center text-xs text-ink-2">
        {footerLine(digest, formatDate)}
      </footer>
    </main>
  );
}

const KIND_LABEL: Record<ChangeEntry["kind"], string> = { new: "New", changed: "Changed", deleted: "Deleted" };
const BANNER_PREVIEW = 4;

/** One change: kind word + title + date; opens its source unless the record was deleted. */
function ChangeItem({ change: c, compact }: { change: ChangeEntry; compact?: boolean }) {
  const { open } = useEvidence();
  return (
    <button
      type="button"
      disabled={c.kind === "deleted"}
      onClick={() => open({
        value: c.title, sourceType: c.sourceType, clioId: c.clioId, sourceDate: c.sourceDate, quote: null,
        drawerKey: c.drawerKey, derivation: "clio-metadata", quoteVerified: false,
      })}
      className={cn(
        "flex min-h-6 w-full cursor-pointer items-baseline gap-2 rounded-md text-left text-sm hover:bg-white focus-visible:outline-2 disabled:cursor-default disabled:opacity-60",
        compact ? "px-1.5 py-0.5" : "px-2 py-1",
      )}
    >
      <span className="shrink-0 rounded border border-new/30 bg-new-bg px-1.5 text-xs leading-5 font-semibold text-new">{KIND_LABEL[c.kind]}</span>
      <span className="min-w-0 flex-1 truncate text-ink">{c.title}</span>
      <span className="tabular shrink-0 font-mono text-xs text-ink-2">{formatDate(c.sourceDate ?? c.detectedAt)}</span>
    </button>
  );
}

/** "N updates since your last view" summary; quiet line when nothing changed, nothing on a first open. */
function ChangesBanner({ changes, since, isCompare, onlyNew, onToggleOnlyNew, onMarkSeen }: {
  changes: ChangeEntry[]; since: string | null; isCompare: boolean; onlyNew: boolean;
  onToggleOnlyNew: () => void; onMarkSeen?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const when = since ? formatDate(since) : null;
  if (changes.length === 0) {
    if (!when) return null;
    return (
      <p className="inline-flex items-center gap-1.5 text-sm text-ink-2" role="status">
        <CheckCheck className="size-4 text-ink-3" aria-hidden />
        No changes since {isCompare ? when : `your last view on ${when}`}.
      </p>
    );
  }
  const shown = expanded ? changes : changes.slice(0, BANNER_PREVIEW);
  const more = changes.length - BANNER_PREVIEW;
  const noun = `update${changes.length === 1 ? "" : "s"}`;
  return (
    <section aria-labelledby="changes-banner-title" className="rounded-xl border border-new/30 bg-new-bg px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id="changes-banner-title" className="inline-flex items-center gap-2 text-sm font-semibold text-new">
          <BellDot className="size-4 shrink-0" aria-hidden />
          <span>
            <span className="tabular">{changes.length}</span> {noun} since{" "}
            {isCompare ? when : when ? `your last view on ${when}` : "your last view"}
          </span>
        </h2>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToggleOnlyNew}
            aria-pressed={onlyNew}
            className={cn(
              "inline-flex h-8 cursor-pointer items-center rounded-lg border px-3 text-sm focus-visible:outline-2",
              onlyNew ? "border-new bg-new text-white hover:bg-new/90" : "border-new/30 bg-white text-new hover:border-new/60",
            )}
          >
            {onlyNew ? "Show all items" : "Only show these"}
          </button>
          {onMarkSeen && (
            <button type="button" onClick={onMarkSeen} className="inline-flex h-8 cursor-pointer items-center rounded-lg px-3 text-sm text-ink-2 hover:bg-white hover:text-ink focus-visible:outline-2">
              Mark seen
            </button>
          )}
        </div>
      </div>
      <ul id="changes-banner-list" className="mt-2 grid grid-cols-1 gap-x-4 gap-y-0.5 md:grid-cols-2">
        {shown.map((c, i) => <li key={`${c.drawerKey}-${i}`} className="min-w-0"><ChangeItem change={c} compact /></li>)}
      </ul>
      {more > 0 && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls="changes-banner-list"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 inline-flex min-h-6 cursor-pointer items-center gap-1 rounded-md px-1.5 text-xs font-medium text-new hover:bg-white focus-visible:outline-2"
        >
          <ChevronDown className={cn("size-3.5 transition-transform motion-reduce:transition-none", expanded && "rotate-180")} aria-hidden />
          {expanded ? "Show fewer" : `+${more} more`}
        </button>
      )}
    </section>
  );
}

function ChangeList({ changes, onlyNew, onToggleOnlyNew }: { changes: ChangeEntry[]; onlyNew: boolean; onToggleOnlyNew: () => void }) {
  return (
    <div className="flex flex-col gap-2">
      <ul className="max-h-72 space-y-1 overflow-y-auto">
        {changes.map((c, i) => <li key={`${c.drawerKey}-${i}`}><ChangeItem change={c} /></li>)}
      </ul>
      <button type="button" onClick={onToggleOnlyNew} aria-pressed={onlyNew} className="min-h-6 cursor-pointer self-start rounded-md border border-line px-2 py-1 text-xs hover:bg-paper focus-visible:outline-2">
        {onlyNew ? "Show all items in lists" : "Only show these in lists"}
      </button>
    </div>
  );
}
