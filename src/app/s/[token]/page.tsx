import type { Metadata } from "next";
import { notFound } from "next/navigation";
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
  if (!view) notFound(); // unknown, expired and revoked are the same 404 (see not-found.tsx)
  return (
    <>
      <ViewBeacon token={token} />
      <ProviderViewCard view={view} token={token} />
    </>
  );
}
