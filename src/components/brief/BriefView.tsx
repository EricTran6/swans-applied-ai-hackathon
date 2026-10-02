"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { History, Layers, ListTree } from "lucide-react";
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
    <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6">
      <BriefHeader digest={digest} toolbar={toolbar} />

      <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center gap-2 border-b border-line bg-paper/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
        <Popover>
          <PopoverTrigger
            disabled={changes.length === 0}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm",
              changes.length === 0 ? "border-line text-ink-2" : onlyNew ? "border-info bg-info text-white" : "border-info/30 bg-info-bg text-info",
            )}
          >
            <span className={cn("size-2 rounded-full", changes.length ? (onlyNew ? "bg-white" : "bg-info") : "bg-ink-3")} />
            {changes.length} {since ? `changed since ${formatDate(since)}` : "new since last open"}
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
            className="h-8 rounded-lg border border-line bg-white px-2 text-sm"
            aria-label="Compare since date"
          />
        </label>
        {onMarkSeen && changes.length > 0 && !since && (
          <button type="button" onClick={onMarkSeen} className="h-8 rounded-lg px-2 text-sm text-ink-2 hover:bg-white focus-visible:outline-2">
            Mark seen
          </button>
        )}
        <div className="ml-auto inline-flex rounded-lg border border-line bg-white p-0.5" role="group" aria-label="Depth">
          {([["brief", "2-min brief", Layers], ["everything", "Everything", ListTree]] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              aria-pressed={depth === key}
              onClick={() => setDepth(key)}
              className={cn("inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm", depth === key ? "bg-navy text-white" : "text-ink-2 hover:bg-paper")}
            >
              <Icon className="size-3.5" aria-hidden /> {label}
            </button>
          ))}
        </div>
      </div>

      <WarningsBanner warnings={digest.meta.warnings} onRefresh={onRefresh} />

      <KpiRow kpis={digest.kpis} coverage={digest.coverage} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]">
        <CitedBrief brief={digest.brief} openQuestions={digest.openQuestions} />
        <RecoveryMap digest={digest} />
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
            className="w-full rounded-xl border border-dashed border-line py-3 text-sm text-ink-2 hover:bg-white focus-visible:outline-2"
          >
            Show everything: all {digest.timeline.length} timeline events, sortable and filterable
          </button>
        )}
      </div>

      <footer className="pb-6 text-center text-xs text-ink-2">
        {footerLine(digest, formatDate)}
      </footer>
    </div>
  );
}

const KIND_LABEL: Record<ChangeEntry["kind"], string> = { new: "New", changed: "Changed", deleted: "Deleted" };

function ChangeList({ changes, onlyNew, onToggleOnlyNew }: { changes: ChangeEntry[]; onlyNew: boolean; onToggleOnlyNew: () => void }) {
  const { open } = useEvidence();
  return (
    <div className="flex flex-col gap-2">
      <ul className="max-h-72 space-y-1 overflow-y-auto">
        {changes.map((c, i) => (
          <li key={`${c.drawerKey}-${i}`}>
            <button
              type="button"
              disabled={c.kind === "deleted"}
              onClick={() => open({
                value: c.title, sourceType: c.sourceType, clioId: c.clioId, sourceDate: c.sourceDate, quote: null,
                drawerKey: c.drawerKey, derivation: "clio-metadata", quoteVerified: false,
              })}
              className="flex w-full items-baseline gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-paper disabled:opacity-60"
            >
              <span className="shrink-0 rounded bg-info-bg px-1.5 text-[11px] font-medium text-info">{KIND_LABEL[c.kind]}</span>
              <span className="min-w-0 flex-1 truncate">{c.title}</span>
              <span className="shrink-0 text-xs text-ink-2">{formatDate(c.sourceDate ?? c.detectedAt)}</span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onToggleOnlyNew} aria-pressed={onlyNew} className="self-start rounded-md border border-line px-2 py-1 text-xs hover:bg-paper">
        {onlyNew ? "Show all items in lists" : "Only show these in lists"}
      </button>
    </div>
  );
}
