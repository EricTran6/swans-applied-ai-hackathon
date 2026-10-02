// Provider -> firm replies ("sent" / "will send by" / note). Validated here, persisted by the caller
// (T04's share_responses repo) through the injected `insert`. Nothing is written to Clio.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ShareResponse } from "@/lib/types";

export const MAX_RESPONSE_TEXT = 1000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const responseInputSchema = z.object({
  needId: z.string().trim().min(1).max(100).nullable().optional(),
  kind: z.enum(["sent", "will_send", "note"]),
  promisedDate: z.string().trim().regex(ISO_DATE, "promisedDate must be YYYY-MM-DD")
    .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s, "invalid date")
    .nullable().optional(),
  text: z.string().trim().max(MAX_RESPONSE_TEXT).nullable().optional(),
}).strict().superRefine((v, ctx) => {
  if (v.kind === "will_send" && !v.promisedDate) ctx.addIssue({ code: "custom", message: "will_send needs promisedDate", path: ["promisedDate"] });
  if (v.kind === "note" && !v.text) ctx.addIssue({ code: "custom", message: "note needs text", path: ["text"] });
});
export type ResponseInput = z.infer<typeof responseInputSchema>;

export function validateResponse(input: unknown): { ok: true; value: ResponseInput } | { ok: false; error: string } {
  const r = responseInputSchema.safeParse(input);
  if (r.success) return { ok: true, value: r.data };
  const first = r.error.issues[0];
  return { ok: false, error: `${first?.path?.join(".") || "input"}: ${first?.message ?? "invalid"}` };
}

/**
 * Validate and build a ShareResponse for `shareId`, then hand it to `insert` (DB repo). Throws on invalid input
 * with a message safe to return as a 400 body.
 */
export function recordResponse(shareId: string, input: unknown,
  insert: (r: ShareResponse) => void = () => { throw new Error("share response store not wired"); },
  now: Date = new Date()): ShareResponse {
  if (typeof shareId !== "string" || !shareId.trim()) throw new Error("shareId required");
  const v = validateResponse(input);
  if (!v.ok) throw new Error(v.error);
  const r: ShareResponse = {
    id: randomUUID(), shareId, needId: v.value.needId ?? null, kind: v.value.kind,
    promisedDate: v.value.promisedDate ?? null, text: v.value.text || null, createdAt: now.toISOString(),
  };
  insert(r);
  return r;
}
