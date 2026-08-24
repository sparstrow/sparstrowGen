import { Skeleton } from "@/components/ui/skeleton";

/**
 * What the client-component pattern this replaces could not do usefully.
 * `useTeams()` rendered a skeleton keyed off `isLoading`, indistinguishable
 * from any other page's spinner. This one is shaped like the actual grid it
 * precedes, because Next now knows what "loading" means for this specific
 * route rather than the page having to track it in state.
 */
export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    </div>
  );
}
