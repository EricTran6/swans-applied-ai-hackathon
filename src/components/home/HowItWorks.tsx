import { Database, Lock, Quote, Share2, type LucideIcon } from "lucide-react";

const STEPS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Lock, title: "Clio, read-only", body: "We only read your matters. Nothing is ever written back to Clio." },
  { icon: Database, title: "Digested once, cached", body: "AI runs when records change, not on every open. Cost is tracked per case." },
  { icon: Quote, title: "Every fact cited", body: "Each number and date links to the note, email or page it came from." },
  { icon: Share2, title: "Curated provider share", body: "You choose what a provider sees: status, bills and records, never strategy." },
];

export function HowItWorks() {
  return (
    <section aria-labelledby="how-h" className="rounded-xl border border-line bg-white p-6">
      <h2 id="how-h" className="font-serif text-xl font-semibold text-ink">How it works</h2>
      <ol className="mt-4 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-paper text-navy ring-1 ring-line">
              <s.icon className="size-4" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-medium text-ink"><span className="font-mono text-ink-2">{i + 1}.</span> {s.title}</p>
              <p className="mt-0.5 text-sm text-ink-2">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
