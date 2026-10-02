"use client";
import Link from "next/link";
import { StateCard } from "@/components/brief/MatterBrief";

export default function MatterError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <StateCard title="Something went wrong">
      <p>{error.message || "The brief failed to render."}</p>
      <div className="flex gap-2">
        <button type="button" onClick={reset} className="rounded-lg bg-navy px-3 py-1.5 text-sm text-white">Try again</button>
        <Link href="/" className="rounded-lg border border-line px-3 py-1.5 text-sm">All matters</Link>
      </div>
    </StateCard>
  );
}
