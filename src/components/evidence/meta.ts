import type { SourceType } from "@/lib/types";
export const SOURCE_LABEL: Record<SourceType, string> = {
  matter: "Matter", custom_field: "Clio field", contact: "Contact", note: "Note", communication: "Communication",
  task: "Task", calendar_entry: "Calendar entry", expense: "Expense", document: "Document",
};
