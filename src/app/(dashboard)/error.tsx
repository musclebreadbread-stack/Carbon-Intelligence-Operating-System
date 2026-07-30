"use client";

// Error boundaries must be Client Components. This one wraps every dashboard
// route that does not declare a closer boundary of its own.

import { ModuleError } from "@/components/layout/module-error";

export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return <ModuleError error={error} retry={unstable_retry} />;
}
