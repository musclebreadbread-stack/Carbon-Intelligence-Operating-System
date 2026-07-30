import { Skeleton } from "@/components/ui/skeleton";

/**
 * Instant loading state for every dashboard route.
 *
 * The pages are dynamic (they call `connection()` and read cookies) and several of
 * them run the calculation orchestrator over 24 months of activity data, so a
 * meaningful skeleton is worth more here than a spinner: it mirrors the header,
 * KPI row and table that every module renders.
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-6" data-testid="dashboard-loading">
      <div className="space-y-2">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
