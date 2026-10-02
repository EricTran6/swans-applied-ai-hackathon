"use client";
import { useEffect, useRef, useState } from "react";
import { matchTextItems } from "./highlight";

/** Renders page N of a PDF to canvas and overlays highlight boxes on text items matching the quote. Falls back to an iframe. */
export function PdfViewer({ url, page, quote }: { url: string; page: number; quote: string | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [boxes, setBoxes] = useState<{ l: number; t: number; w: number; h: number }[]>([]);
  const [status, setStatus] = useState<"loading" | "ok">("loading");

  useEffect(() => {
    let cancelled = false;
    setFailed(false); setBoxes([]); setStatus("loading");
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        // Run pdf.js's worker in-thread (bundler-safe; no worker URL needed). Single pages only, so cost is small.
        // @ts-expect-error no types for the worker bundle
        (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker ??= await import("pdfjs-dist/build/pdf.worker.min.mjs");
        const doc = await pdfjs.getDocument({ url }).promise;
        const pg = await doc.getPage(Math.min(Math.max(page, 1), doc.numPages));
        const width = wrapRef.current?.clientWidth || 520;
        const base = pg.getViewport({ scale: 1 });
        const viewport = pg.getViewport({ scale: width / base.width });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = viewport.width; canvas.height = viewport.height;
        await pg.render({ canvas, viewport }).promise;
        const tc = await pg.getTextContent();
        const items = tc.items.filter((i): i is typeof i & { str: string; transform: number[]; width: number; height: number } => "str" in i);
        const hit = matchTextItems(items.map((i) => i.str), quote);
        const next = [...hit].map((idx) => {
          const it = items[idx];
          const [a, , , , e, f] = it.transform;
          const scale = viewport.scale;
          const h = (it.height || Math.abs(a)) * scale;
          return { l: e * scale, t: viewport.height - f * scale - h * 0.85, w: it.width * scale, h: h * 1.1 };
        });
        if (!cancelled) { setBoxes(next); setStatus("ok"); }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [url, page, quote]);

  if (failed) {
    return <iframe title="Source PDF" src={`${url}#page=${page}`} className="h-[70vh] w-full rounded border" />;
  }
  return (
    <div ref={wrapRef} className="relative w-full overflow-hidden rounded border bg-muted/30">
      {status === "loading" && <div className="p-4 text-xs text-muted-foreground">Loading page {page}...</div>}
      <canvas ref={canvasRef} className="block w-full" />
      {boxes.map((b, i) => (
        <div key={i} data-testid="pdf-highlight" className="pointer-events-none absolute rounded-sm bg-yellow-300/50 mix-blend-multiply"
          style={{ left: b.l, top: b.t, width: b.w, height: b.h }} />
      ))}
    </div>
  );
}
