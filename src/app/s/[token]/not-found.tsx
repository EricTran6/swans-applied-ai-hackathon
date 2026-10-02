import { LinkIcon } from "lucide-react";
import { ProviderShell } from "@/components/share/provider/shell";

// Same 404 page for unknown, expired and revoked share links.
export default function ShareNotFound() {
  return (
    <ProviderShell>
      <section className="mt-6 rounded-xl border border-line bg-white p-6 text-center">
        <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-info-bg text-info">
          <LinkIcon aria-hidden className="size-5" />
        </span>
        <h1 className="mt-3 font-serif text-2xl font-semibold text-ink">This link is no longer active</h1>
        <p className="mt-2 text-sm text-ink-2">This link has expired or was revoked. Contact the firm for a new one.</p>
      </section>
    </ProviderShell>
  );
}
