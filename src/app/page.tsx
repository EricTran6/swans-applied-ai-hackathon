import Link from "next/link";
import { MatterList } from "@/components/brief/MatterList";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-16">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-semibold text-ink">Case Lens</h1>
          <p className="mt-1 text-sm text-ink-2">
            Every matter, digested into a 90-second brief. Every fact links to its source in Clio.
          </p>
        </div>
        <Link href="/connect" className="text-sm text-navy underline-offset-4 hover:underline">Clio connection</Link>
      </header>
      <section>
        <h2 className="mb-3 text-[11px] font-medium uppercase tracking-wide text-ink-3">Matters</h2>
        <MatterList />
      </section>
    </main>
  );
}
