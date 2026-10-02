import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Document } from "@/lib/types";
import { downloadDocument } from "./download";

const doc = { sourceType: "document", clioId: "55", name: "x.pdf", filename: "x.pdf", latestVersionId: "56" } as Document;

describe("downloadDocument", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("CLIO_BASE_URL", "https://app.clio.example/api/v4");
    vi.stubEnv("CLIO_ACCESS_TOKEN", "test-token");
    vi.stubEnv("CLIO_FIXTURE_DIR", "");
  });
  afterEach(() => { fetchMock.mockReset(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("follows the 303 to the signed URL without the Authorization header", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 303, headers: { Location: "https://bucket.s3.amazonaws.com/f?sig=1" } }))
      .mockResolvedValueOnce(new Response(new Uint8Array([37, 80, 68, 70]), { status: 200 }));
    const buf = await downloadDocument(doc);
    expect(buf.toString()).toBe("%PDF");
    const [u1, i1] = fetchMock.mock.calls[0];
    expect(u1).toBe("https://app.clio.example/api/v4/documents/55/download.json?document_version_id=56");
    expect(i1.headers.Authorization).toBe("Bearer test-token");
    expect(i1.redirect).toBe("manual");
    const [u2, i2] = fetchMock.mock.calls[1];
    expect(u2).toBe("https://bucket.s3.amazonaws.com/f?sig=1");
    expect(i2.headers.Authorization).toBeUndefined();
    expect(i2.method).toBe("GET");
  });

  it("refuses redirects to unexpected or non-https hosts", async () => {
    for (const loc of ["https://evil.example/x", "http://bucket.s3.amazonaws.com/x", "https://127.0.0.1/x"]) {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 303, headers: { Location: loc } }));
      await expect(downloadDocument(doc)).rejects.toThrow(/refusing redirect/);
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
