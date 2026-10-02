"use client";
// STUB (owner T06). Fixed exports used by brief + share UIs. T06 replaces the bodies, keeps the signatures.
import type { SourceRef } from "@/lib/types";

/** Small clickable chip for a fact's source; opens the evidence drawer via EvidenceProvider. */
export function SourceChip({ sourceRef, label }: { sourceRef: SourceRef; label?: string }) {
  return <span data-drawer-key={sourceRef.drawerKey}>{label ?? sourceRef.value}</span>;
}

/** Wrap the attorney page once; provides open(drawerKey, quote?) to SourceChips and renders the drawer. */
export function EvidenceProvider({ matterId, children }: { matterId: string; children: React.ReactNode }) {
  void matterId;
  return <>{children}</>;
}

export function useEvidence(): { open: (sourceRef: SourceRef) => void } {
  return { open: () => {} };
}
