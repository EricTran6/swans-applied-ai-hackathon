"use client";
import { useState } from "react";
import { CircleCheck, Clock, Hourglass, Sparkles, TriangleAlert } from "lucide-react";
import type { ActionItem, Digest, RankedItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatDate } from "./lib";
import { Empty, Panel, Pill, Refs, itemKey, type Tone } from "./primitives";

const CATEGORIES: RankedItem["category"][] = ["medical", "insurance", "liability", "client", "litigation", "money", "other"];

export function TopTen({ items, total, newKeys, onlyNew }: {
  items: RankedItem[]; total: number; newKeys: Set<string>; onlyNew: boolean;
}) {
  const [cat, setCat] = useState<RankedItem["category"] | null>(null);
  const present = CATEGORIES.filter((c) => items.some((i) => i.category === c));
  const shown = items.filter((i) => (!cat || i.category === cat) && (!onlyNew || newKeys.has(itemKey(i.ref))));

  return (
    <Panel title={`${items.length} that matter`} aside={`of ${total} items in Clio`}>
      {present.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {[null, ...present].map((c) => (
            <button
              key={c ?? "all"}
              type="button"
              onClick={() => setCat(c)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs capitalize",
                cat === c ? "border-navy bg-navy text-white" : "border-line text-ink-2 hover:bg-paper",
              )}
            >
              {c ?? "All"}
            </button>
          ))}
        </div>
      )}
      {shown.length === 0 ? (
        <Empty>{onlyNew ? "Nothing new in the top items since your last open." : "No ranked items yet."}</Empty>
      ) : (
        <ol className="divide-y divide-line">
          {shown.map((i) => {
            const isNew = newKeys.has(itemKey(i.ref));
            return (
              <li key={`${i.rank}-${i.ref.drawerKey}`} className={cn("flex gap-3 py-2.5", isNew && "brief-new")}>
                <span className="tabular w-5 shrink-0 pt-0.5 text-right font-serif text-lg leading-none text-ink-3">{i.rank}</span>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    {isNew && <span className="size-2 shrink-0 self-center rounded-full bg-info" title="New since last open" />}
                    <span className="font-medium text-ink">{i.title}</span>
                    {i.date && <span className="font-mono text-[11px] text-ink-3">{formatDate(i.date)}</span>}
                  </div>
                  <p className="text-sm text-ink-2">{i.why}</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-ink-3">{i.category}</span>
                    <Refs refs={[i.ref]} max={1} />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}

function ActionRow({ a, lane }: { a: ActionItem; lane: "overdue" | "upcoming" | "waiting" | "suggested" }) {
  const w = a.waitingOn;
  return (
    <li className="space-y-1 py-2">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 text-sm text-ink">{a.title}</span>
        {lane === "overdue" && a.daysLate != null && <span className="tabular shrink-0 text-xs font-semibold text-danger">{a.daysLate}d late</span>}
        {lane === "upcoming" && a.daysUntil != null && <span className="tabular shrink-0 text-xs font-semibold text-warn">in {a.daysUntil}d</span>}
        {lane === "waiting" && w?.daysSilent != null && <span className="tabular shrink-0 text-xs font-semibold text-info">{w.daysSilent}d silent</span>}
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
        {lane === "waiting" && w && (
          <span className="text-ink-2">
            {w.name} · {w.requests} request{w.requests === 1 ? "" : "s"}
          </span>
        )}
        {a.due && <span>due {formatDate(a.due, { year: false })}</span>}
        {a.owner && <span>{a.owner}</span>}
        {a.origin === "ai-suggested" && <span className="text-navy">AI suggested</span>}
        <Refs refs={a.refs} max={1} />
      </div>
    </li>
  );
}

function Lane({ title, tone, icon: Icon, items, lane }: {
  title: string; tone: Tone; icon: typeof Clock; items: ActionItem[]; lane: "overdue" | "upcoming" | "waiting" | "suggested";
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <Pill tone={tone}><Icon className="size-3" aria-hidden />{title}</Pill>
        <span className="tabular text-xs text-ink-3">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="py-2 text-xs text-ink-3">None</p>
      ) : (
        <ul className="divide-y divide-line">{items.map((a) => <ActionRow key={`${lane}-${a.id}`} a={a} lane={lane} />)}</ul>
      )}
    </div>
  );
}

export function ActionBoard({ board, sol }: { board: Digest["actionBoard"]; sol: Digest["header"]["sol"] }) {
  return (
    <Panel
      title="Action board"
      aside={sol ? (
        <span className="inline-flex flex-wrap items-center gap-1">
          {sol.status === "satisfied" ? (
            <Pill tone="ok"><CircleCheck className="size-3" aria-hidden />SOL satisfied</Pill>
          ) : sol.status === "open" ? (
            <Pill tone="warn"><TriangleAlert className="size-3" aria-hidden />SOL {formatDate(sol.date)}</Pill>
          ) : (
            <Pill>SOL unknown</Pill>
          )}
          <Refs refs={sol.refs} max={1} />
        </span>
      ) : <Pill>SOL not recorded in Clio</Pill>}
    >
      <div className="space-y-4">
        <Lane title="Overdue" tone="danger" icon={TriangleAlert} items={board.overdue} lane="overdue" />
        <Lane title="Upcoming" tone="warn" icon={Clock} items={board.upcoming} lane="upcoming" />
        <Lane title="Waiting on" tone="info" icon={Hourglass} items={board.waiting} lane="waiting" />
        {board.suggested.length > 0 && (
          <Lane title="Suggested (AI)" tone="neutral" icon={Sparkles} items={board.suggested} lane="suggested" />
        )}
      </div>
    </Panel>
  );
}
