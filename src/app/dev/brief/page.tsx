import { notFound } from "next/navigation";
import type { Digest } from "@/lib/types";
import { EvidenceProvider } from "@/components/evidence";
import { BriefView } from "@/components/brief/BriefView";

// Dev-only preview of the brief on the synthetic fixture digest (fake client). Never served in production.
export const dynamic = "force-dynamic";

export default async function DevBriefPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const digest = (await import("../../../../fixtures/sample-digest.json")).default as unknown as Digest;
  return (
    <EvidenceProvider matterId={digest.matterId}>
      <BriefView digest={digest} sinceLastOpen={digest.changeFeed} lastOpenedAt={null} />
    </EvidenceProvider>
  );
}
