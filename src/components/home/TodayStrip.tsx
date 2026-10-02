"use client";
import Link from "next/link";
import { AlertTriangle, CalendarClock, Eye, Hourglass, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { matterHref, type TileKey, type TodayTile } from "./lib";
import { FOCUS } from "./TopBar";

const STYLE: Record<TileKey, { icon: LucideIcon; active: string; word: string }> = {
  overdue: { icon: AlertTriangle, active: "text-danger", word: "late" },
  upcoming7d: { icon: CalendarClock, active: "text-navy", word: "coming up" },
  waiting: { icon: Hourglass, active: "text-info", word: "waiting" },
  sharesOpened: { icon: Eye, active: "text-ok", word: "opened" },
};

function Tile({ tile }: { tile: TodayTile }) {
  const s = STYLE[tile.key];
  const Icon = s.icon;
  const active = tile.total > 0;
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium uppercase tracking-wide text-ink-2">{tile.label}</span>
        <Icon className={cn("size-4", active ? s.active : "text-ink-2")} aria-hidden />
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className={cn("font-serif text-[32px] font-semibold leading-none tabular-nums", active ? s.active : "text-ink")}>{tile.total}</span>
        <span className="text-sm text-ink-2">{active ? s.word : "none"}</span>
      </div>
    </>
  );
  const box = "flex min-h-[112px] flex-col rounded-xl border border-line bg-white p-4";
  if (active && tile.matters.length === 1) {
    const m = tile.matters[0];
    return (
      <Link href={matterHref(m)} className={cn(box, "transition-colors hover:border-navy/40", FOCUS)}
        aria-label={`${tile.total} ${tile.label.toLowerCase()}, open ${m.clientName}`}>
        {body}
        <span className="mt-auto truncate pt-2 text-[13px] text-navy">{m.clientName} →</span>
      </Link>
    );
  }
  return (
    <div className={box}>
      {body}
      {active && (
        <ul className="mt-auto flex flex-wrap gap-x-3 gap-y-1 pt-2 text-[13px]" aria-label={`Matters with ${tile.label.toLowerCase()}`}>
          {tile.matters.slice(0, 4).map((m) => (
            <li key={m.clioId}>
              <Link href={matterHref(m)} className={cn("rounded text-navy underline-offset-4 hover:underline", FOCUS)}>{m.clientName}</Link>
            </li>
          ))}
          {tile.matters.length > 4 && <li className="text-ink-2">+{tile.matters.length - 4} more</li>}
        </ul>
      )}
    </div>
  );
}

export function TodayStrip({ tiles }: { tiles: TodayTile[] }) {
  return (
    <section aria-labelledby="today-h">
      <h2 id="today-h" className="mb-3 font-serif text-xl font-semibold text-ink">Today</h2>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((t) => <Tile key={t.key} tile={t} />)}
      </div>
    </section>
  );
}
