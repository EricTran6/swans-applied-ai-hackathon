"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { History, Layers, ListTree } from "lucide-react";
import type { ChangeEntry, Digest } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatDate } from "./lib";
import { BriefHeader } from "./Header";
import { KpiRow } from "./KpiRow";
import { CitedBrief, ProviderBills, Waterfall } from "./BriefPanels";
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
}

export function BriefView({ digest, sinceLastOpen, lastOpenedAt, toolbar, onCompareSince, compareSince, onMarkSeen }: BriefViewProps) {
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
        <button
          type="button"
          onClick={() => setOnlyNew((v) => !v)}
          disabled={changes.length === 0}
          aria-pressed={onlyNew}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm",
            changes.length === 0 ? "border-line text-ink-3" : onlyNew ? "border-info bg-info text-white" : "border-info/30 bg-info-bg text-info",
          )}
          title={changes.map((c) => `${c.kind}: ${c.title}`).join("\n")}
        >
          <span className={cn("size-2 rounded-full", changes.length ? (onlyNew ? "bg-white" : "bg-info") : "bg-ink-3")} />
          {changes.length} {since ? `changed since ${formatDate(since)}` : "new since last open"}
          {!since && lastOpenedAt && <span className="hidden text-xs opacity-75 sm:inline">({formatDate(lastOpenedAt)})</span>}
        </button>
        <label className="inline-flex items-center gap-1.5 text-sm text-ink-2">
          <History className="size-4 text-ink-3" aria-hidden />
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
          <button type="button" onClick={onMarkSeen} className="h-8 rounded-lg px-2 text-sm text-ink-2 hover:bg-white">
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

      {digest.meta.warnings.length > 0 && (
        <p className="rounded-lg border border-warn/20 bg-warn-bg px-3 py-2 text-xs text-warn">{digest.meta.warnings.join(" · ")}</p>
      )}

      <KpiRow kpis={digest.kpis} coverage={digest.coverage} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]">
        <CitedBrief brief={digest.brief} openQuestions={digest.openQuestions} />
        <Waterfall steps={digest.valueWaterfall} />
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
            className="w-full rounded-xl border border-dashed border-line py-3 text-sm text-ink-2 hover:bg-white"
          >
            Show everything: all {digest.timeline.length} timeline events, sortable and filterable
          </button>
        )}
      </div>

      <footer className="pb-6 text-center text-xs text-ink-3">
        Digest v{digest.version} · built {formatDate(digest.meta.builtAt)} · {Object.values(digest.meta.models).join(", ") || "no AI"}
        {digest.meta.droppedRefs > 0 && ` · ${digest.meta.droppedRefs} unverifiable citation${digest.meta.droppedRefs > 1 ? "s" : ""} dropped`}
      </footer>
    </div>
  );
}
