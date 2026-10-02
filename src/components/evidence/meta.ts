import { format, isValid, parseISO } from "date-fns";
import type { SourceType } from "@/lib/types";
export const SOURCE_LABEL: Record<SourceType, string> = {
  matter: "Matter", custom_field: "Clio field", contact: "Contact", note: "Note", communication: "Communication",
  task: "Task", calendar_entry: "Calendar entry", expense: "Expense", document: "Document",
};

/** "2024-05-27T03:00:00-07:00" -> "May 27, 2024" (uses the calendar date as written, no timezone shift). */
export function formatSourceDate(iso: string): string {
  const d = parseISO(iso.slice(0, 10));
  return isValid(d) ? format(d, "MMM d, yyyy") : iso;
}
