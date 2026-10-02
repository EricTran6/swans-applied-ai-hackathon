"use client";
// Dev page: chips from fixtures/sample-digest.json with mocked /api/source and PDF fetches.
import { useEffect, useState } from "react";
import type { ClioRecord, SourceRef } from "@/lib/types";
import { EvidenceProvider, SourceChip } from "@/components/evidence";
import digest from "../../../../fixtures/sample-digest.json";

function collectRefs(node: unknown, out: Map<string, SourceRef>) {
  if (Array.isArray(node)) node.forEach((n) => collectRefs(n, out));
  else if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    if (typeof o.drawerKey === "string" && typeof o.sourceType === "string") out.set(`${o.drawerKey}|${o.value}`, o as unknown as SourceRef);
    else Object.values(o).forEach((v) => collectRefs(v, out));
  }
}

export default function DevEvidence() {
  const [ready, setReady] = useState(false);
  const refs = new Map<string, SourceRef>();
  collectRefs(digest, refs);
  const list = [...refs.values()].slice(0, 24);

  useEffect(() => {
    const real = window.fetch.bind(window);
    const byKey = new Map(list.map((r) => [r.drawerKey.split("#")[0], r]));
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith("/api/source")) {
        const key = decodeURIComponent(new URL(url, location.origin).searchParams.get("drawerKey") ?? "");
        const r = byKey.get(key);
        if (!r) return new Response("{}", { status: 404 });
        const record = { sourceType: r.sourceType, clioId: r.clioId, sourceDate: r.sourceDate, title: r.value, drawerKey: key,
          bodyText: r.quote ? `Earlier context for this entry.\n${r.quote}\nTrailing text of the record.` : "", clioUrl: "https://app.clio.com" } as unknown as ClioRecord;
        return Response.json({ record });
      }
      return real(input, init);
    };
    setReady(true);
    return () => { window.fetch = real; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-lg font-semibold">Evidence drawer dev page</h1>
      <p className="text-sm text-muted-foreground">Chips from the sample digest; /api/source is mocked. Document PDFs need the real API.</p>
      {ready && (
        <EvidenceProvider matterId={digest.matterId}>
          <div className="flex flex-wrap gap-2">{list.map((r, i) => <SourceChip key={i} sourceRef={r} />)}</div>
        </EvidenceProvider>
      )}
    </main>
  );
}
