"use client";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { Injury, TimelineEvent } from "@/lib/types";
import { SourceChip, useEvidence } from "@/components/evidence";
import { cn } from "@/lib/utils";
import { formatDate, groupInjuries, uniqueRefs, sortFilterTimeline, type TimelineSortKey } from "./lib";
import { Empty, Panel, Pill, Refs, itemKey, type Tone } from "./primitives";
import { CATEGORY_COLOR } from "./StoryStrip";

const INJURY_STATUS: Record<Injury["status"], { label: string; tone: Tone }> = {
  "surgery-done": { label: "Surgery done", tone: "danger" },
  "surgery-recommended": { label: "Surgery recommended", tone: "warn" },
  diagnosed: { label: "Diagnosed", tone: "neutral" },
};

export function Injuries({ injuries }: { injuries: Injury[] }) {
  const groups = groupInjuries(injuries);
  return (
    <Panel title="Injuries" aside="from medical documents · chips open the page">
      {groups.length === 0 ? (
        <Empty>No injuries extracted from documents yet.</Empty>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <div key={g.bodyPart} className="rounded-lg border border-line p-3">
              <h3 className="mb-2 font-serif text-[15px] font-semibold">{g.bodyPart}</h3>
              <ul className="space-y-2">
                {g.injuries.map((i, idx) => (
                  <li key={`${i.name}-${idx}`} className="space-y-1">
                    <div className="text-sm text-ink">{i.name}</div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Pill tone={INJURY_STATUS[i.status].tone}>{INJURY_STATUS[i.status].label}</Pill>
                      {i.firstDocumented && <span className="text-xs text-ink-3">since {formatDate(i.firstDocumented)}</span>}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {uniqueRefs(i.refs).map((r, ri) => (
                        <SourceChip key={`${r.drawerKey}-${ri}`} sourceRef={r} label={r.page ? `p${r.page}` : undefined} />
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

const CATS: TimelineEvent["category"][] = ["incident", "treatment", "legal", "insurance", "communication", "money"];

export function EverythingTable({ timeline, newKeys, onlyNew }: { timeline: TimelineEvent[]; newKeys: Set<string>; onlyNew: boolean }) {
  const { open } = useEvidence();
  const [sort, setSort] = useState<TimelineSortKey>("date");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("");

  const rows = useMemo(() => {
    const r = sortFilterTimeline(timeline, { sort, dir, query, category: category || null });
    return onlyNew ? r.filter((e) => e.refs.some((x) => newKeys.has(itemKey(x)))) : r;
  }, [timeline, sort, dir, query, category, onlyNew, newKeys]);

  const header = (key: TimelineSortKey, label: string, className?: string) => (
    <th className={cn("px-2 py-2 text-left font-medium", className)}>
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-ink"
        onClick={() => { if (sort === key) setDir(dir === "asc" ? "desc" : "asc"); else { setSort(key); setDir(key === "date" ? "desc" : "asc"); } }}
      >
        {label}
        {sort === key && (dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </th>
  );

  return (
    <Panel title="Everything" aside={`${rows.length} of ${timeline.length} events`}>
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter events or quotes…"
          aria-label="Filter events"
          className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-navy sm:max-w-xs"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Category"
          className="h-8 rounded-lg border border-line bg-white px-2 text-sm capitalize"
        >
          <option value="">All categories</option>
          {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      {rows.length === 0 ? (
        <Empty>No events match.</Empty>
      ) : (
        <div className="-mx-4 overflow-x-auto sm:mx-0">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead className="border-b border-line text-xs text-ink-3">
              <tr>
                {header("date", "Date", "w-32")}
                {header("title", "Event")}
                {header("category", "Category", "w-32")}
                <th className="px-2 py-2 text-left font-medium">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((e) => {
                const isNew = e.refs.some((x) => newKeys.has(itemKey(x)));
                return (
                  <tr
                    key={e.id}
                    tabIndex={0}
                    onClick={() => e.refs[0] && open(e.refs[0])}
                    onKeyDown={(k) => { if (k.key === "Enter" && e.refs[0]) open(e.refs[0]); }}
                    className={cn("cursor-pointer align-top hover:bg-paper focus-visible:bg-paper focus-visible:outline-none", isNew && "brief-new")}
                  >
                    <td className="tabular px-2 py-2 font-mono text-xs whitespace-nowrap text-ink-2">
                      {formatDate(e.date)}
                      {e.derivation !== "stated" && <span className="ml-1 text-ink-3" title={`Date is ${e.derivation}`}>{e.derivation === "inferred" ? "~" : "·"}</span>}
                    </td>
                    <td className="px-2 py-2 text-ink">
                      {isNew && <span className="mr-1.5 inline-block size-2 rounded-full bg-info" title="New since last open" />}
                      {e.title}
                    </td>
                    <td className="px-2 py-2 text-xs capitalize text-ink-2">
                      <span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: CATEGORY_COLOR[e.category] }} />
                      {e.category}
                    </td>
                    <td className="px-2 py-2" onClick={(ev) => ev.stopPropagation()}><Refs refs={e.refs} max={2} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
