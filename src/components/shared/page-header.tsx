import * as React from "react";

import { Badge } from "@/components/ui/badge";

export type PageHeaderProps = {
  readonly title: string;
  readonly description?: string;
  /** Small status chips, e.g. reporting year, GWP version, consolidation approach. */
  readonly meta?: readonly { readonly label: string; readonly value: string }[];
  readonly actions?: React.ReactNode;
};

/** Consistent module heading; a server component, no interactivity of its own. */
export function PageHeader({ title, description, meta, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
        {meta && meta.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {meta.map((item) => (
              <Badge key={`${item.label}:${item.value}`} variant="secondary" className="font-normal">
                <span className="text-muted-foreground">{item.label}:</span>&nbsp;{item.value}
              </Badge>
            ))}
          </div>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
