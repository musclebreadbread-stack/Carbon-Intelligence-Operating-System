"use client";

// Segment boundary for the analytics module: a failure in its heavier reads (the
// calculation orchestrator, the statistical engines, the framework mapping) keeps
// the shell and the rest of the navigation interactive.

import { ModuleError } from "@/components/layout/module-error";

export default function AnalyticsError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return <ModuleError error={error} retry={unstable_retry} segment="analytics" />;
}
