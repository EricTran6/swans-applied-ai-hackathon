import { readFileSync } from "node:fs";
import path from "node:path";
import { ProviderViewCard } from "@/components/share/provider";
import type { ProviderView } from "@/lib/types";

export const dynamic = "force-dynamic";

// Dev preview: renders the synthetic fixture in a 390px phone frame. Replies are disabled (no token).
export default function DevProviderPage() {
  const view = JSON.parse(readFileSync(path.join(process.cwd(), "fixtures/sample-provider-view.json"), "utf8")) as ProviderView;
  return (
    <div className="mx-auto w-[390px] max-w-full border-x">
      <ProviderViewCard view={view} />
    </div>
  );
}
