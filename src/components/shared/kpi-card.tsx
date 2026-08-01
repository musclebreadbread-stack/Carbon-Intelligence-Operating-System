import * as React from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatDelta } from "@/components/shared/stat-delta";
import { cn } from "@/lib/utils";

export type KpiCardProps = {
  readonly title: string;
  /** Pre-formatted, because the caller knows whether it is tCO2e, %, or currency. */
  readonly value: string;
  readonly unit?: string;
  readonly change?: number | null;
  readonly goodDirection?: "down" | "up" | "neutral";
  readonly description?: string;
  readonly icon?: React.ElementType;
  /** Where the figure came from, shown as a footnote so a KPI is never unsourced. */
  readonly source?: string;
  readonly className?: string;
};

export function KpiCard({
  title,
  value,
  unit,
  change,
  goodDirection = "down",
  description,
  icon: Icon,
  source,
  className,
}: KpiCardProps) {
  return (
    <Card className={cn(className)} data-testid={`kpi-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center justify-between">
          <span>{title}</span>
          {Icon && <Icon className="size-4 text-muted-foreground" />}
        </CardDescription>
        <CardTitle className="text-2xl">
          {value}
          {unit && (
            <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="flex flex-wrap items-center gap-1">
          {change !== undefined && (
            <StatDelta change={change} goodDirection={goodDirection} label={description} />
          )}
          {change === undefined && description && (
            <span className="text-xs text-muted-foreground">{description}</span>
          )}
        </div>
        {source && <p className="text-[11px] text-muted-foreground/80">{source}</p>}
      </CardContent>
    </Card>
  );
}
