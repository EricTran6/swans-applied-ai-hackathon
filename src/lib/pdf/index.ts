// In-app PDF text extraction (pdfjs-dist legacy build in Node, no poppler). pages[0] = page 1. Owner T01.
interface TextItemLike { str?: string; hasEOL?: boolean }

export async function extractPdfText(bytes: Uint8Array): Promise<{ pageCount: number; pages: string[] }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // pdfjs transfers/detaches the buffer it is given: always pass a copy.
  const data = new Uint8Array(bytes);
  const task = pdfjs.getDocument({ data, useSystemFonts: false, disableFontFace: true, verbosity: 0 });
  const doc = await task.promise;
  try {
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let text = "";
      for (const it of content.items as TextItemLike[]) {
        if (typeof it.str !== "string") continue;
        text += it.str;
        if (it.hasEOL) text += "\n";
      }
      pages.push(text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim());
      page.cleanup();
    }
    return { pageCount: doc.numPages, pages };
  } finally {
    await task.destroy();
  }
}

/** True when the PDF has a usable text layer (not a pure scan). */
export function hasTextLayer(pages: string[]): boolean {
  const chars = pages.join("").replace(/\s+/g, "").length;
  return pages.length > 0 && chars / pages.length >= 20;
}
