import { Skeleton } from "@/components/ui/skeleton";

export function BriefSkeleton() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto flex w-full max-w-[1360px] flex-col gap-4 px-4 py-6 sm:px-6" aria-busy="true" aria-label="Loading brief">
      <div className="flex gap-4 rounded-xl border border-line bg-white p-5">
        <Skeleton className="size-16 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-96 max-w-full" />
          <Skeleton className="h-5 w-72 max-w-full" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]">
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
      <Skeleton className="h-32 rounded-xl" />
    </main>
  );
}
