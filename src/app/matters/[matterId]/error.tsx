"use client";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { BTN_PRIMARY, BTN_SECONDARY, StateCard } from "@/components/brief/MatterBrief";

export default function MatterError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <StateCard
      tone="error"
      title="Something went wrong"
      actions={
        <>
          <button type="button" onClick={reset} className={BTN_PRIMARY}>
            <RefreshCw className="size-4" aria-hidden /> Try again
          </button>
          <Link href="/" className={BTN_SECONDARY}>
            <ArrowLeft className="size-4" aria-hidden /> All matters
          </Link>
        </>
      }
    >
      <p>{error.message || "The brief failed to render."}</p>
    </StateCard>
  );
}
