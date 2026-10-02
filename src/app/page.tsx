import { HomeDashboard } from "@/components/home/HomeDashboard";

// Read FIRM_NAME at request time, not at build time.
export const dynamic = "force-dynamic";

export default function Home() {
  return <HomeDashboard firmName={process.env.FIRM_NAME?.trim() || null} />;
}
