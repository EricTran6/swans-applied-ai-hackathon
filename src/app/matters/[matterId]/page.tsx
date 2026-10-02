import { EvidenceProvider } from "@/components/evidence";
import { MatterBrief } from "@/components/brief/MatterBrief";

export default async function MatterPage({ params }: { params: Promise<{ matterId: string }> }) {
  const { matterId } = await params;
  return (
    <EvidenceProvider matterId={matterId}>
      <MatterBrief matterId={matterId} />
    </EvidenceProvider>
  );
}
