import { cn } from "@/lib/utils";

/** Placeholder block; pulses only when the user allows motion. */
function Block({ className }: { className?: string }) {
  return <div aria-hidden className={cn("rounded-md bg-line/60 motion-safe:animate-pulse", className)} />;
}

const CARD = "rounded-xl border border-line bg-white p-5";

function PanelLines({ rows }: { rows: number }) {
  return (
    <div className="mt-4 space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Block className="size-4 shrink-0 rounded-full" />
          <Block className={cn("h-4", i % 2 === 0 ? "w-4/5" : "w-3/5")} />
        </div>
      ))}
    </div>
  );
}

export function BriefSkeleton() {
  return (
    <main
      id="main"
      tabIndex={-1}
      aria-busy="true"
      className="mx-auto flex w-full max-w-[1360px] flex-col gap-4 px-4 py-6 sm:px-6"
    >
      <p role="status" className="sr-only">Loading case brief…</p>

      <div className={cn(CARD, "flex min-w-0 gap-4")}>
        <Block className="size-14 shrink-0 rounded-full sm:size-16" />
        <div className="min-w-0 flex-1 space-y-2.5 pt-1">
          <Block className="h-7 w-64 max-w-full" />
          <Block className="h-4 w-96 max-w-full" />
          <Block className="h-5 w-72 max-w-full" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={cn(CARD, "space-y-3 p-4")}>
            <Block className="h-3 w-24" />
            <Block className="h-8 w-32 max-w-full" />
            <Block className="h-3 w-20" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]">
        <div className={cn(CARD, "min-w-0")}>
          <Block className="h-5 w-40" />
          <PanelLines rows={6} />
        </div>
        <div className={cn(CARD, "min-w-0")}>
          <Block className="h-5 w-32" />
          <PanelLines rows={4} />
        </div>
      </div>

      <div className={CARD}>
        <Block className="h-5 w-36" />
        <Block className="mt-4 h-20 w-full" />
      </div>
    </main>
  );
}
