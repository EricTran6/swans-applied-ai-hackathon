import { repos } from "@/lib/db";
import { errorJson, json } from "@/lib/server/http";
import type { SourceType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES: readonly SourceType[] = ["matter", "custom_field", "contact", "note", "communication", "task", "calendar_entry", "expense", "document"];

/** "document:55#p3" -> { type, clioId, page }. Returns null if malformed. */
function parseDrawerKey(key: string): { type: SourceType; clioId: string; page: number | null } | null {
  const m = /^([a-z_]+):([^#\s]{1,128})(?:#p(\d{1,5}))?$/.exec(key);
  if (!m || !TYPES.includes(m[1] as SourceType)) return null;
  return { type: m[1] as SourceType, clioId: m[2], page: m[3] ? Number(m[3]) : null };
}

export async function GET(req: Request): Promise<Response> {
  const key = new URL(req.url).searchParams.get("drawerKey");
  const parsed = key ? parseDrawerKey(key) : null;
  if (!parsed) return errorJson(400, "invalid drawerKey");
  const r = repos();
  const item = r.items.get(parsed.type, parsed.clioId);
  if (!item || item.deletedAt) return errorJson(404, "not found");
  const body: { record: unknown; documentText?: { page: number; pageCount: number; text: string } } = { record: item.record };
  if (parsed.type === "document" && parsed.page != null) {
    const t = r.documentTexts.latest(parsed.clioId);
    if (t && parsed.page >= 1 && parsed.page <= t.pages.length) {
      body.documentText = { page: parsed.page, pageCount: t.pageCount, text: t.pages[parsed.page - 1] };
    }
  }
  return json(body);
}
