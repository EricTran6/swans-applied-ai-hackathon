"use client";
// Evidence drawer provider + SourceChip. Signatures fixed by contract.
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Briefcase, Calendar, CheckSquare, FileText, Mail, NotebookText, Receipt, Tag, User, type LucideIcon } from "lucide-react";
import type { SourceRef, SourceType } from "@/lib/types";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { EvidenceDrawer } from "./EvidenceDrawer";
import { SOURCE_LABEL, formatSourceDate } from "./meta";

const ICONS: Record<SourceType, LucideIcon> = {
  matter: Briefcase, custom_field: Tag, contact: User, note: NotebookText, communication: Mail,
  task: CheckSquare, calendar_entry: Calendar, expense: Receipt, document: FileText,
};

const Ctx = createContext<{ open: (sourceRef: SourceRef) => void }>({ open: () => {} });

/** Wrap the attorney page once; provides open(sourceRef) to SourceChips and renders the drawer. */
export function EvidenceProvider({ matterId, children }: { matterId: string; children: React.ReactNode }) {
  void matterId; // source lookups are matter-scoped server-side
  const [active, setActive] = useState<SourceRef | null>(null);
  const open = useCallback((r: SourceRef) => setActive(r), []);
  const value = useMemo(() => ({ open }), [open]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <EvidenceDrawer sourceRef={active} onClose={() => setActive(null)} />
    </Ctx.Provider>
  );
}

export function useEvidence(): { open: (sourceRef: SourceRef) => void } {
  return useContext(Ctx);
}

const DERIVATION: Record<SourceRef["derivation"], string> = { stated: "stated", inferred: "inferred", "clio-metadata": "from Clio field" };

/** Small clickable chip for a fact's source; opens the evidence drawer via EvidenceProvider. */
export function SourceChip({ sourceRef, label }: { sourceRef: SourceRef; label?: string }) {
  const { open } = useEvidence();
  const Icon = ICONS[sourceRef.sourceType] ?? FileText;
  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <button type="button" data-drawer-key={sourceRef.drawerKey} onClick={() => open(sourceRef)}
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border bg-muted/50 px-2 py-0.5 text-xs text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring" />
        }
      >
        <Icon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
        <span>{label ?? sourceRef.value}</span>
      </HoverCardTrigger>
      <HoverCardContent className="w-64 space-y-1 text-xs">
        <div className="font-medium">{SOURCE_LABEL[sourceRef.sourceType]}{sourceRef.page ? `, page ${sourceRef.page}` : ""}</div>
        {sourceRef.sourceDate && <div className="text-muted-foreground">{formatSourceDate(sourceRef.sourceDate)}</div>}
        <div>Derivation: {DERIVATION[sourceRef.derivation]}</div>
        <div>{sourceRef.quoteVerified ? "Quote verified" : sourceRef.sourceType === "document" ? "Model-read, check page" : "No quote to verify"}</div>
        <div className="text-muted-foreground">Click to open source</div>
      </HoverCardContent>
    </HoverCard>
  );
}
