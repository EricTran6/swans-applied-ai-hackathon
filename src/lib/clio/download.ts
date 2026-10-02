// Document download: GET documents/{id}/download.json (auth) -> 303 -> signed storage URL fetched
// WITHOUT the Authorization header, after checking the redirect host.
import fs from "node:fs";
import path from "node:path";
import type { Document } from "@/lib/types";
import { buildClioUrl, clioApiBase, clioFetch } from "./http";
import { fixtureDir } from "./raw";

const DEFAULT_HOST_SUFFIXES = ["clio.com", "clio.net", "goclio.com", "goclio.eu", "amazonaws.com",
  "cloudfront.net", "googleapis.com", "blob.core.windows.net"];

function hostAllowed(u: URL): boolean {
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || /^[\d.]+$/.test(host) || host.includes(":")) return false; // no IP literals
  if (host === new URL(clioApiBase()).hostname.toLowerCase()) return true;
  const extra = (process.env.CLIO_DOWNLOAD_HOSTS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return [...DEFAULT_HOST_SUFFIXES, ...extra].some((s) => host === s || host.endsWith(`.${s}`));
}

/** Fixture mode: scripts/clio_dump.py saved files as <dir>/documents/<id>_<filename>. */
function fixtureFile(doc: Document): string | null {
  const dir = fixtureDir();
  if (!dir) return null;
  const fn = (doc.filename || doc.name || doc.clioId).replace(/[^\w.\- ]/g, "_");
  const p = path.join(dir, "documents", `${doc.clioId}_${fn}`);
  return fs.existsSync(p) ? p : null;
}

export async function downloadDocument(doc: Document): Promise<Buffer> {
  if (!/^\d+$/.test(doc.clioId)) throw new Error("invalid document id");
  if (fixtureDir()) {
    const p = fixtureFile(doc);
    if (!p) throw new Error(`fixture file for document ${doc.clioId} not found`);
    return fs.readFileSync(p);
  }
  const params: Record<string, string> = {};
  if (doc.latestVersionId && /^\d+$/.test(doc.latestVersionId)) params.document_version_id = doc.latestVersionId;
  let res = await clioFetch(buildClioUrl(`documents/${doc.clioId}/download.json`, params), { redirect: "manual" });
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get("Location");
    if (!loc) throw new Error(`document ${doc.clioId}: redirect without Location`);
    const target = new URL(loc, clioApiBase());
    if (!hostAllowed(target)) throw new Error(`document ${doc.clioId}: refusing redirect to ${target.hostname}`);
    res = await clioFetch(target.toString(), { auth: false, redirect: "manual" });
  }
  if (res.status !== 200) throw new Error(`document ${doc.clioId}: download failed HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
