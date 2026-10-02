"use client";
import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import type { ClioRecord, SourceRef } from "@/lib/types";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { splitByQuote } from "./highlight";
import { PdfViewer } from "./PdfViewer";
import { SOURCE_LABEL } from "./meta";

type SourcePayload = { record: ClioRecord; documentText?: { pages: string[] } };

export function EvidenceDrawer({ sourceRef, onClose }: { sourceRef: SourceRef | null; onClose: () => void }) {
  const [data, setData] = useState<SourcePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = sourceRef?.drawerKey;

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    setData(null); setError(null);
    fetch(`/api/source?drawerKey=${encodeURIComponent(key.split("#")[0])}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: SourcePayload) => { if (!cancelled) setData(j); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [key]);

  const rec = data?.record;
  const isDoc = sourceRef?.sourceType === "document";
  const page = sourceRef?.page ?? 1;
  const clioUrl = rec?.clioUrl ?? sourceRef?.clioUrl;

  return (
    <Sheet open={!!sourceRef} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="data-[side=right]:sm:max-w-xl w-full overflow-y-auto p-4">
        {sourceRef && (
          <>
            <SheetHeader className="p-0 pr-8">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{SOURCE_LABEL[sourceRef.sourceType]}</Badge>
                {(rec?.sourceDate ?? sourceRef.sourceDate) && <span className="text-xs text-muted-foreground">{rec?.sourceDate ?? sourceRef.sourceDate}</span>}
                {isDoc && <Badge variant="outline">page {page}</Badge>}
              </div>
              <SheetTitle>{rec?.title ?? sourceRef.value}</SheetTitle>
              <SheetDescription>
                {sourceRef.derivation === "stated" ? "Stated in the record" : sourceRef.derivation === "inferred" ? "Inferred from the record" : "From a Clio field"}
                {" · "}
                {sourceRef.quoteVerified ? "quote verified" : isDoc ? "model-read, check page" : "quote not verified"}
              </SheetDescription>
            </SheetHeader>

            {error && <p className="text-sm text-destructive">Could not load source ({error}).</p>}
            {!data && !error && <p className="text-sm text-muted-foreground">Loading source...</p>}

            {rec && isDoc && <PdfViewer url={`/api/documents/${encodeURIComponent(rec.clioId)}/file`} page={page} quote={sourceRef.quote} />}
            {rec && isDoc && data?.documentText?.pages?.[page - 1] && (
              <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">Extracted text, page {page}</summary>
                <BodyText text={data.documentText.pages[page - 1]} quote={sourceRef.quote} />
              </details>
            )}
            {rec && !isDoc && (rec.bodyText
              ? <BodyText text={rec.bodyText} quote={sourceRef.quote} />
              : <p className="text-sm text-muted-foreground">This Clio record has no text body. Value shown: {sourceRef.value}</p>)}

            {sourceRef.quote && !isDoc && rec && !sourceRef.quoteVerified && (
              <p className="text-xs text-muted-foreground">Cited: &ldquo;{sourceRef.quote}&rdquo;</p>
            )}

            {clioUrl && (
              <a href={clioUrl} target="_blank" rel="noreferrer" className="mt-auto inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline">
                <ExternalLink className="size-4" /> Open matter in Clio
              </a>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function BodyText({ text, quote }: { text: string; quote: string | null }) {
  const segs = splitByQuote(text, quote);
  return (
    <div className="whitespace-pre-wrap rounded border bg-muted/30 p-3 text-sm leading-relaxed">
      {segs.map((s, i) => s.hit
        ? <mark key={i} ref={(el) => el?.scrollIntoView({ block: "center" })} className="rounded-sm bg-yellow-300/60 px-0.5 text-foreground">{s.text}</mark>
        : <span key={i}>{s.text}</span>)}
    </div>
  );
}
