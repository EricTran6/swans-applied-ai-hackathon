import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractPdfText, hasTextLayer } from "./index";

describe("extractPdfText", () => {
  it("returns per-page text for the sample bill of particulars", async () => {
    const bytes = fs.readFileSync(path.resolve(__dirname, "../../../fixtures/documents/bill-of-particulars-sample.pdf"));
    const out = await extractPdfText(bytes);
    expect(out.pageCount).toBe(3);
    expect(out.pages).toHaveLength(3);
    expect(out.pages[2]).toContain("TEAR OF THE MEDIAL MENISCUS");
    expect(out.pages[0]).not.toContain("TEAR OF THE MEDIAL MENISCUS");
    expect(hasTextLayer(out.pages)).toBe(true);
    // the caller's buffer is not detached
    expect(bytes.length).toBeGreaterThan(0);
  });
});
