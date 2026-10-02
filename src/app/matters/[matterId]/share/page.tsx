import { ShareBuilder } from "@/components/share/builder";

export default async function SharePage({ params }: { params: Promise<{ matterId: string }> }) {
  const { matterId } = await params;
  return <ShareBuilder matterId={matterId} />;
}
