import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";

/** Read-only notice shown above every provider page so it never reads like the attorney view. */
export function ReadOnlyBanner({ firmName }: { firmName?: string }) {
  return (
    <div role="note" aria-label="Read-only case update" className="border-b border-line bg-info-bg text-info">
      <div className="mx-auto flex w-full max-w-xl items-start gap-3 px-4 py-3">
        <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0" />
        <div className="min-w-0 text-sm">
          <p className="font-semibold">Read-only case update{firmName ? ` shared by ${firmName}` : ""}</p>
          <p className="text-[13px] opacity-90">Only status, bills and records are shared.</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Tinted provider canvas: navy top rule, info banner, single column.
 * `embedded` renders a plain container (used for the attorney's live preview inside the builder).
 */
export function ProviderShell({ firmName, embedded = false, children }: { firmName?: string; embedded?: boolean; children: ReactNode }) {
  const body = <div className="mx-auto w-full max-w-xl space-y-4 px-4 py-5">{children}</div>;
  if (embedded) {
    return (
      <div className="overflow-hidden rounded-lg border-t-4 border-navy bg-paper text-ink">
        <ReadOnlyBanner firmName={firmName} />
        {body}
      </div>
    );
  }
  return (
    <div className="min-h-dvh border-t-4 border-navy bg-paper text-ink">
      <ReadOnlyBanner firmName={firmName} />
      <main id="main" tabIndex={-1} className="outline-none">{body}</main>
    </div>
  );
}
