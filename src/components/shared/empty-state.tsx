import * as React from "react";
import { Inbox } from "lucide-react";

import { cn } from "@/lib/utils";

export type EmptyStateProps = {
  readonly title: string;
  readonly description?: string;
  readonly icon?: React.ElementType;
  readonly action?: React.ReactNode;
  readonly className?: string;
};

/**
 * "There is nothing here" state.
 *
 * Deliberately distinct from an error: several repository reads legitimately return
 * an empty list in demo mode (persisted analyses, audit entries, agent executions),
 * and saying so is more useful than an empty table with no explanation.
 */
export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center",
        className,
      )}
      data-testid="empty-state"
    >
      <Icon className="size-5 text-muted-foreground" />
      <p className="text-sm font-medium">{title}</p>
      {description && (
        <p className="max-w-md text-xs text-muted-foreground">{description}</p>
      )}
      {action}
    </div>
  );
}
