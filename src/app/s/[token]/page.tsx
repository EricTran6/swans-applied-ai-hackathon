import type { Metadata } from "next";
import { headers } from "next/headers";
import { ProviderViewCard } from "@/components/share/provider";
import { ViewBeacon } from "./view-beacon";
import type { ProviderView } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Case update",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

async function load(token: string): Promise<ProviderView | null> {
  const h = await headers();
  const host = h.get("host");
  const base = host ? `${h.get("x-forwarded-proto") ?? "http"}://${host}` : (process.env.APP_BASE_URL ?? "http://127.0.0.1:3000");
  try {
    const res = await fetch(`${base}/api/share/${encodeURIComponent(token)}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as ProviderView;
  } catch {
    return null;
  }
}

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await load(token);
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
