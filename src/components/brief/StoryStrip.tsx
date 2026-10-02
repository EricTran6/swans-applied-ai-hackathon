"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { TimelineEvent } from "@/lib/types";
import { useEvidence } from "@/components/evidence";
import { cn } from "@/lib/utils";
import { formatDate, stripLayout, type StripBox } from "./lib";
import { Empty, NewBadge, Panel, itemKey, useNow } from "./primitives";

export const CATEGORY_COLOR: Record<TimelineEvent["category"], string> = {
  incident: "var(--danger)", treatment: "var(--ok)", legal: "var(--navy)",
  insurance: "var(--info)", communication: "var(--ink-3)", money: "var(--warn)",
};
const CATEGORY_LABEL: Record<TimelineEvent["category"], string> = {
  incident: "Incident", treatment: "Treatment", legal: "Legal", insurance: "Insurance", communication: "Contact", money: "Money",
};

const MIN_W = 900;      // below this the strip scrolls horizontally, newest end first
const PAD = 40;
const LABEL_H = 36;
const ROW = 44;
const TIP_W = 280;
/** Label width estimate per char at the 12px mono / 13px title sizes (lib default 7 assumed 11px). */
const CHAR_W = 7.5;

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(([e]) => e && setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export function StoryStrip({ timeline, newKeys }: { timeline: TimelineEvent[]; newKeys?: Set<string> }) {
  const { open } = useEvidence();
  const now = useNow(60_000);
  const [hostRef, hostW] = useWidth<HTMLDivElement>();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const milestones = timeline.filter((e) => e.milestone);

  const scrolls = hostW > 0 && hostW < MIN_W;
  const W = hostW > 0 ? Math.max(hostW, scrolls ? MIN_W : 0) : MIN_W;
  const layout = stripLayout(milestones, { width: W, pad: PAD, now: now ?? undefined, rowsAbove: 3, rowsBelow: 2, charW: CHAR_W });
  const isNewEvent = (e: TimelineEvent) => { const r = e.refs[0]; return r ? !!newKeys?.has(itemKey(r)) : false; };
  const anyNew = milestones.some(isNewEvent);

  // Newest end in view first when the strip has to scroll.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && scrolls) el.scrollLeft = el.scrollWidth;
  }, [scrolls, W, milestones.length]);

  const labelBoxes: (StripBox | null)[] = [...layout.clusters.map((c) => c.label), layout.today?.box ?? null];
  const usedAbove = Math.max(0, ...labelBoxes.map((b) => (b?.side === "above" ? b.row + 1 : 0)));
  const usedBelow = Math.max(0, ...labelBoxes.map((b) => (b?.side === "below" ? b.row + 1 : 0)));
  const axisY = 12 + usedAbove * ROW + 14;
  const H = axisY + 34 + usedBelow * ROW + 12;
  const boxTop = (b: StripBox) => (b.side === "above" ? axisY - 18 - b.row * ROW - LABEL_H : axisY + 34 + b.row * ROW);
  const connector = (b: StripBox) => {
    const top = boxTop(b);
    return b.side === "above" ? { y: top + LABEL_H, h: axisY - 10 - (top + LABEL_H) } : { y: axisY + 10, h: top - (axisY + 10) };
  };

  return (
    <Panel
      title="Story so far"
      aside={
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
          {anyNew && (
            <span className="inline-flex items-center gap-1 text-new">
              <span aria-hidden className="size-2.5 rounded-full border border-white bg-new ring-1 ring-new/40" /> New since last view
              <span aria-hidden className="text-ink-3">·</span>
            </span>
          )}
          {milestones.length} milestones · click a dot for its source
        </span>
      }
      className="relative left-1/2 w-[calc(100vw-48px)] -translate-x-1/2"
    >
      {milestones.length === 0 ? (
        <Empty hint="Milestones appear once the digest finds dated events in Clio.">No milestones yet.</Empty>
      ) : (
        <div ref={hostRef} className="w-full">
          <div ref={scrollRef} className={cn("w-full", scrolls ? "overflow-x-auto" : "overflow-visible")}>
            <div className="relative" style={{ width: W, height: H }} role="group" aria-label="Case milestones timeline">
              <div className="absolute h-0.5 bg-line" style={{ left: PAD - 16, width: W - 2 * (PAD - 16), top: axisY - 1 }} />

              {layout.breaks.map((b, i) => (
                <span
                  key={`br-${i}`}
                  aria-hidden
                  title="Gap in activity (time axis compressed)"
                  className="absolute -translate-x-1/2 bg-white px-0.5 font-mono text-[13px] leading-none font-semibold text-ink-2"
                  style={{ left: b.x, top: axisY - 8 }}
                >
                  {"//"}
                </span>
              ))}

              {layout.ticks.map((t) => (
                <span key={`tk-${t.label}`} className="tabular absolute -translate-x-1/2 font-mono text-xs leading-4 whitespace-nowrap text-ink-2" style={{ left: t.x, top: axisY + 12 }}>
                  <span aria-hidden className="absolute -top-3 left-1/2 h-1.5 w-px bg-ink-2" />
                  {t.label}
                </span>
              ))}

              {layout.today && (
                <>
                  <span aria-hidden className="absolute size-2.5 -translate-x-1/2 rotate-45 bg-navy" style={{ left: layout.today.x, top: axisY - 5 }} />
                  {layout.today.box && (
                    <>
                      <span aria-hidden className="absolute w-px border-l border-dashed border-navy" style={{ left: layout.today.x, top: connector(layout.today.box).y, height: connector(layout.today.box).h }} />
                      <span
                        className="absolute flex items-center justify-center rounded-full border border-navy bg-white text-[12px] font-semibold text-navy"
                        style={{ left: layout.today.box.left, width: layout.today.box.right - layout.today.box.left, top: boxTop(layout.today.box) + (layout.today.box.side === "above" ? LABEL_H - 22 : 0), height: 22 }}
                      >
                        Today
                      </span>
                    </>
                  )}
                </>
              )}

              {layout.clusters.map((c, i) => {
                const first = c.events[0]!;
                const multi = c.events.length > 1;
                const isNew = c.events.some(isNewEvent);
                const color = CATEGORY_COLOR[first.category];
                const tipLeft = Math.min(Math.max(c.x - TIP_W / 2, 0), Math.max(0, W - TIP_W)) - c.x;
                const showTip = pinned === i;
                const act = () => {
                  if (!multi && c.label && first.refs[0]) open(first.refs[0]);
                  else setPinned(showTip ? null : i);
                };
                const summary = (multi
                  ? `${c.events.length} milestones from ${formatDate(first.date)}`
                  : `${first.title}, ${formatDate(first.date)}, ${CATEGORY_LABEL[first.category]}${first.derivation === "inferred" ? ", date inferred" : ""}`)
                  + (isNew ? ", new since last view" : "");
                const hasTip = multi || !c.label;
                return (
                  <div
                    key={`${first.id}-${i}`}
                    className="group absolute z-10 -translate-x-1/2 focus-within:z-40 hover:z-40"
                    style={{ left: c.x, top: axisY - 12, width: 24, height: 24 }}
                    onKeyDown={(e) => { if (e.key === "Escape") setPinned(null); }}
                    onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPinned((p) => (p === i ? null : p)); }}
                  >
                    {c.label && (
                      <>
                        <span aria-hidden className="absolute w-px bg-line" style={{ left: 12, top: connector(c.label).y - (axisY - 12), height: connector(c.label).h }} />
                        <span
                          className="pointer-events-none absolute flex flex-col items-center overflow-hidden text-center leading-tight"
                          style={{ left: c.label.left - c.x + 12, width: c.label.right - c.label.left, top: boxTop(c.label) - (axisY - 12), height: LABEL_H, justifyContent: c.label.side === "above" ? "flex-end" : "flex-start" }}
                        >
                          <span className="font-mono text-xs whitespace-nowrap text-ink-2">{c.label.date}</span>
                          <span className="max-w-full truncate text-[13px] font-semibold text-ink">{c.label.text}</span>
                        </span>
                      </>
                    )}
                    <button
                      type="button"
                      aria-label={summary}
                      aria-expanded={hasTip ? showTip : undefined}
                      onClick={act}
                      className="relative flex size-6 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2"
                    >
                      <span
                        className={cn("flex items-center justify-center rounded-full border-2 bg-white", multi ? "size-5" : "size-3.5")}
                        style={{ borderColor: color }}
                      >
                        {multi ? <span className="text-xs leading-none font-bold text-ink">{c.events.length}</span> : <span className="size-1.5 rounded-full" style={{ background: color }} />}
                      </span>
                      {isNew && <span aria-hidden className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border border-white bg-new ring-1 ring-new/40" />}
                    </button>
                    {hasTip && (
                      <ul
                        className={cn(
                          "absolute z-30 max-h-64 overflow-auto rounded-lg border border-line bg-white p-1 text-left shadow-lg",
                          showTip ? "block" : "hidden group-focus-within:block group-hover:block",
                        )}
                        style={{ left: 12 + tipLeft, top: 26, width: Math.min(TIP_W, W) }}
                      >
                        {c.events.map((e) => (
                          <li key={e.id}>
                            <button
                              type="button"
                              disabled={!e.refs[0]}
                              onClick={() => e.refs[0] && open(e.refs[0])}
                              className="flex min-h-6 w-full cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-paper disabled:cursor-default focus-visible:bg-paper focus-visible:outline-2 focus-visible:outline-navy"
                            >
                              <span aria-hidden className="mt-1 size-2 shrink-0 rounded-full" style={{ background: CATEGORY_COLOR[e.category] }} />
                              <span className="min-w-0">
                                <span className="flex items-center gap-1.5 font-mono text-xs text-ink-2">
                                  {formatDate(e.date)} · {CATEGORY_LABEL[e.category]}
                                  {isNewEvent(e) && <NewBadge className="font-sans" />}
                                </span>
                                <span className="line-clamp-2 text-[13px] font-medium text-ink" title={e.title}>{e.title}</span>
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}
