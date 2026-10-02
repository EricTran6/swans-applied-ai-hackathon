"use client";

import { ShareBuilder, type BuilderApi } from "@/components/share/builder";
import type { ShareCandidate, ShareSummary } from "@/lib/types";
import view from "../../../../fixtures/sample-provider-view.json";

// Dev harness: mocked API built from the synthetic provider-view fixture. No network.
const cand = (id: string, category: ShareCandidate["category"], label: string, preview: string, o: Partial<ShareCandidate> = {}): ShareCandidate =>
  ({ id, category, label, preview, included: true, hardDeny: false, providerContactId: "p1", flag: null, ...o });

const candidates: ShareCandidate[] = [
  cand("status:stage", "stage", "Case stage", view.stage.label),
  cand("status:alive", "status", "Case status", view.status.label),
  cand("kpi:coverage", "coverage", "Coverage confirmed", "Liability coverage confirmed in writing"),
  ...view.needs.map((n) => cand(n.id, "requests", "Request", n.text, { flag: { level: "review", reason: "Rewritten from internal task" } })),
  ...view.appointments.map((a, i) => cand(`calendar:${i}`, "appointments", a.title, `${a.title} on ${a.date}`)),
  ...view.records.map((r, i) => cand(`document:${i}`, "own_records", r.name, r.name)),
  cand("expense:bill", "own_bill", "Their bill", "Bill on file, ledger update requested"),
  cand("document:other", "other_records", "Orthopaedic records", "Another provider's records", { included: false }),
  cand("note:strategy", "attorney_notes", "Case posture note", "Internal strategy", { included: false, hardDeny: true, flag: { level: "block", reason: "Attorney notes are never shared" } }),
  cand("kpi:value", "valuation", "Case value", "Valuation", { included: false, hardDeny: true, flag: { level: "block", reason: "Valuation is never shared" } }),
  cand("note:risky", "updates", "Update from note", "Mentions negotiation", { flag: { level: "block", reason: "Mentions settlement strategy" } }),
];

let shares: ShareSummary[] = [{
  shareId: "s1", recipientLabel: view.recipientLabel, recipientContactId: "p1", createdAt: view.sharedAt, expiresAt: view.expiresAt,
  revokedAt: null, views: 2, firstViewedAt: view.sharedAt, lastViewedAt: "2026-10-02T10:42:00", sharedCount: 8, withheldCount: 3,
  responses: [{ id: "r1", shareId: "s1", needId: "task:100042", kind: "will_send", promisedDate: "Oct 9", text: null, createdAt: view.sharedAt }],
}];

const api: BuilderApi = {
  async loadCase() {
    return {
      digest: null, shares,
      contacts: [{ clioId: "p1", name: view.recipientLabel, role: "Treating provider, physical therapy", roleKind: "provider" } as never],
    };
  },
  async draft() { return { candidates, counts: { shared: 0, withheld: 0 } }; },
  async send() { return { shareId: "s2", url: "http://localhost:3000/s/mock-token", expiresAt: view.expiresAt }; },
  async listShares() { return shares; },
  async revoke(id) { shares = shares.map((s) => (s.shareId === id ? { ...s, revokedAt: new Date().toISOString() } : s)); },
};

export default function Page() { return <ShareBuilder matterId="dev" api={api} />; }
