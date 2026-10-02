import type { Metadata } from "next";
import { ProviderViewCard } from "@/components/share/provider";
import { ViewBeacon } from "./view-beacon";
import { findLiveShare } from "@/lib/server/shares";
import { hashToken } from "@/lib/share";
import type { ProviderView } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Case update",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

/** Read the frozen payload directly; never fetch via a URL built from request headers. */
function load(token: string): ProviderView | null {
  try {
    const s = findLiveShare(hashToken, token);
    return s ? (JSON.parse(s.payloadJson) as ProviderView) : null;
  } catch {
    return null;
  }
}

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = load(token);
  if (!view) {
    return (
      <main className="mx-auto max-w-xl p-6 text-center">
        <h1 className="text-xl font-semibold">This link has expired or been revoked</h1>
        <p className="mt-2 text-sm text-muted-foreground">Please contact the law firm that sent it and ask for a new link.</p>
      </main>
    );
  }
  return (
    <>
      <ViewBeacon token={token} />
      <ProviderViewCard view={view} token={token} />
    </>
  );
}
