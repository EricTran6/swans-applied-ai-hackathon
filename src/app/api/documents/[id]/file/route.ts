import fs from "node:fs/promises";
import { repos } from "@/lib/db";
import { errorJson } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Streams the cached PDF of a document that belongs to a synced matter. The id never touches the filesystem. */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return errorJson(404, "not found");
  const r = repos();
  const item = r.items.get("document", id);
  if (!item || item.deletedAt || !r.items.hasMatter(item.matterId)) return errorJson(404, "not found");
  const text = r.documentTexts.latest(id);
  if (!text?.filePath) return errorJson(404, "not found");
  try {
    const bytes = await fs.readFile(text.filePath);
    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": "application/pdf", "Content-Length": String(bytes.length), "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return errorJson(404, "not found");
  }
}
