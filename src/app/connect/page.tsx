import { connectionStatus, oauthConfigured } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default function ConnectPage() {
  const s = connectionStatus();
  const configured = oauthConfigured();
  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-md p-8 space-y-4">
      <h1 className="text-2xl font-semibold">Connect Clio</h1>
      <p className="text-sm">
        Status:{" "}
        <strong>
          {s.connected ? (s.source === "oauth" ? "Connected via OAuth" : "Connected via environment token") : "Not connected"}
        </strong>
        {s.expiresAt ? ` (access token expires ${s.expiresAt})` : ""}
      </p>
      {configured ? (
        <a
          href="/api/auth/clio/start"
          className="inline-flex h-10 items-center rounded-md bg-foreground px-4 text-background text-sm font-medium"
        >
          Connect Clio
        </a>
      ) : (
        <p className="text-sm text-red-600">Set CLIO_CLIENT_ID and CLIO_CLIENT_SECRET to enable OAuth.</p>
      )}
    </main>
  );
}
