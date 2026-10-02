import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2, Lock, Plug, PlugZap } from "lucide-react";
import { connectionStatus, oauthConfigured } from "@/lib/auth";

export const dynamic = "force-dynamic";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy";

export default function ConnectPage() {
  const s = connectionStatus();
  const configured = oauthConfigured();
  return (
    <main id="main" tabIndex={-1} className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-12">
      <div className="flex flex-col gap-5 rounded-xl border border-line bg-white p-6 sm:p-8">
        <span className="flex size-12 items-center justify-center rounded-full bg-paper text-navy ring-1 ring-line">
          <Plug className="size-5" aria-hidden />
        </span>
        <div className="space-y-2">
          <h1 className="font-serif text-2xl font-semibold text-ink">Connect Clio</h1>
          <p className="flex items-start gap-2 text-sm text-ink-2">
            <Lock className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
            Case Lens reads your matters read-only. Nothing is written back to Clio.
          </p>
        </div>

        <p
          className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
            s.connected ? "border-ok/25 bg-ok-bg text-ok" : "border-line bg-paper text-ink-2"
          }`}
        >
          {s.connected ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /> : <PlugZap className="mt-0.5 size-4 shrink-0" aria-hidden />}
          <span className="min-w-0 break-words">
            Status:{" "}
            <strong className="font-semibold">
              {s.connected ? (s.source === "oauth" ? "Connected via OAuth" : "Connected via environment token") : "Not connected"}
            </strong>
            {s.expiresAt ? ` (access token expires ${s.expiresAt})` : ""}
          </span>
        </p>

        {configured ? (
          <a
            href="/api/auth/clio/start"
            className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-navy px-4 text-sm font-medium text-white hover:bg-navy/90 ${FOCUS}`}
          >
            <Plug className="size-4" aria-hidden /> Connect Clio
          </a>
        ) : (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger-bg p-3 text-sm text-danger">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>Set CLIO_CLIENT_ID and CLIO_CLIENT_SECRET to enable OAuth.</span>
          </p>
        )}

        <Link href="/" className={`inline-flex min-h-10 items-center gap-1.5 self-start rounded-lg text-sm text-navy hover:underline ${FOCUS}`}>
          <ArrowLeft className="size-4" aria-hidden /> All matters
        </Link>
      </div>
    </main>
  );
}
