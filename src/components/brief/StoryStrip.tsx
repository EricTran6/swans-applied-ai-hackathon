"use client";
import type { TimelineEvent } from "@/lib/types";
import { useEvidence } from "@/components/evidence";
import { formatDate, stripLayout } from "./lib";
import { Empty, Panel, useNow } from "./primitives";

const W = 1000;
const LANE_H = 36;
export const CATEGORY_COLOR: Record<TimelineEvent["category"], string> = {
  incident: "var(--danger)", treatment: "var(--ok)", legal: "var(--navy)",
  insurance: "var(--info)", communication: "var(--ink-3)", money: "var(--warn)",
};

function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function StoryStrip({ timeline, newKeys }: { timeline: TimelineEvent[]; newKeys?: Set<string> }) {
  const { open } = useEvidence();
  const now = useNow(60_000);
  const milestones = timeline.filter((e) => e.milestone);
  const layout = stripLayout(milestones, { width: W, pad: 70, minGap: 150, maxLanes: 3, now: now ?? undefined });
  const axisY = 18 + layout.lanes * LANE_H + 10;
  const H = axisY + 30;

  return (
    <Panel title="Story so far" aside={`${milestones.length} milestones · click a dot for its source`}>
      {milestones.length === 0 ? (
        <Empty>No milestones yet.</Empty>
      ) : (
        <div className="-mx-1 overflow-x-auto px-1">
          <svg viewBox={`0 0 ${W} ${H}`} className="block w-full min-w-[720px]" role="img" aria-label="Case milestones timeline">
            <line x1={20} x2={W - 20} y1={axisY} y2={axisY} stroke="var(--line)" strokeWidth={2} />
            {layout.ticks.map((t) => (
              <g key={t.label}>
                <line x1={t.x} x2={t.x} y1={axisY - 4} y2={axisY + 4} stroke="var(--ink-3)" />
                <text x={t.x} y={axisY + 18} textAnchor="middle" fontSize={11} fill="var(--ink-3)" fontFamily="var(--font-geist-mono)">{t.label}</text>
              </g>
            ))}
            {layout.today != null && (
              <g>
                <line x1={layout.today} x2={layout.today} y1={8} y2={axisY + 6} stroke="var(--navy)" strokeDasharray="3 3" />
                <text x={layout.today} y={axisY + 18} textAnchor="end" dx={-4} fontSize={11} fontWeight={600} fill="var(--navy)">Today</text>
              </g>
            )}
            {layout.points.map(({ event, x, lane }) => {
              const labelY = axisY - 16 - lane * LANE_H;
              const anchor = x < 110 ? "start" : x > W - 110 ? "end" : "middle";
              const ref = event.refs[0];
              const isNew = ref ? newKeys?.has(`${ref.sourceType}:${ref.clioId}`) : false;
              const act = () => ref && open(ref);
              return (
                <g
                  key={event.id}
                  role="button"
                  tabIndex={0}
                  className="cursor-pointer outline-none [&:focus-visible_circle]:stroke-[3]"
                  onClick={act}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); act(); } }}
                >
                  <title>{`${event.title} · ${formatDate(event.date)} (${event.derivation})`}</title>
                  <line x1={x} x2={x} y1={labelY + 4} y2={axisY} stroke="var(--line)" />
                  <circle cx={x} cy={axisY} r={7} fill="white" stroke={CATEGORY_COLOR[event.category]} strokeWidth={2.5} />
                  <circle cx={x} cy={axisY} r={3} fill={CATEGORY_COLOR[event.category]} />
                  {isNew && <circle cx={x + 7} cy={axisY - 7} r={3.5} fill="var(--info)" />}
                  <text x={x} y={labelY - 13} textAnchor={anchor} fontSize={10.5} fill="var(--ink-3)" fontFamily="var(--font-geist-mono)">
                    {formatDate(event.date)}{event.derivation === "inferred" ? " ~" : ""}
                  </text>
                  <text x={x} y={labelY} textAnchor={anchor} fontSize={13} fontWeight={600} fill="var(--ink)">{clip(event.title, 24)}</text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </Panel>
  );
}
