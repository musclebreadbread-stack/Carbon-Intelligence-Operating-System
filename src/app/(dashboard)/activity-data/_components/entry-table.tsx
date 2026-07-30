"use client";

/** Activity entries with their computed data-quality score. */

import { Badge } from "@/components/ui/badge";
import { DataTable, type ColumnDef } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDate, formatNumber, humaniseEnum, scopeLabel } from "@/lib/format";

export type EntryRow = {
  readonly id: string;
  readonly activityDataName: string;
  readonly sourceName: string;
  readonly scope: string;
  readonly scope3Category: string | null;
  readonly quantity: number;
  readonly unit: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly isEstimated: boolean;
  readonly hasEvidence: boolean;
  readonly uncertainty: number;
  /** `scoreEntry()` overall score, 0–100; `null` when the entry was not calculated. */
  readonly qualityScore: number | null;
  readonly qualityLevel: string | null;
};

const QUALITY_TONE: Readonly<Record<string, string>> = {
  HIGH: "border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
  MEDIUM: "border-amber-500/40 text-amber-700 dark:text-amber-300",
  LOW: "border-orange-500/40 text-orange-700 dark:text-orange-300",
  ESTIMATED: "border-orange-500/40 text-orange-700 dark:text-orange-300",
  DEFAULT: "border-red-500/40 text-red-700 dark:text-red-300",
};

const columns: ColumnDef<EntryRow, unknown>[] = [
  { id: "activityData", header: "Activity data set", accessorFn: (row) => row.activityDataName },
  { id: "source", header: "Emission source", accessorFn: (row) => row.sourceName },
  {
    id: "scope",
    header: "Scope",
    accessorFn: (row) => row.scope,
    cell: ({ row }) => (
      <div className="space-y-0.5">
        <Badge variant="secondary">{scopeLabel(row.original.scope)}</Badge>
        {row.original.scope3Category && (
          <p className="text-[11px] text-muted-foreground">
            {humaniseEnum(row.original.scope3Category)}
          </p>
        )}
      </div>
    ),
  },
  {
    id: "quantity",
    header: "Quantity",
    accessorFn: (row) => row.quantity,
    cell: ({ row }) => (
      <span className="font-mono text-xs">
        {formatNumber(row.original.quantity, 2)} {row.original.unit}
      </span>
    ),
  },
  {
    id: "period",
    header: "Period",
    accessorFn: (row) => row.startDate,
    cell: ({ row }) => (
      <span className="font-mono text-[11px]">
        {formatDate(row.original.startDate)} → {formatDate(row.original.endDate)}
      </span>
    ),
  },
  {
    id: "measurement",
    header: "Measurement",
    accessorFn: (row) => (row.isEstimated ? "estimated" : "metered"),
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1">
        <Badge variant={row.original.isEstimated ? "outline" : "secondary"}>
          {row.original.isEstimated ? "estimated" : "metered"}
        </Badge>
        {row.original.hasEvidence && <Badge variant="outline">evidence</Badge>}
      </div>
    ),
  },
  {
    id: "uncertainty",
    header: "Uncertainty",
    accessorFn: (row) => row.uncertainty,
    cell: ({ row }) => (
      <span className="font-mono text-xs">
        ±{formatNumber(row.original.uncertainty * 100, 1)}%
      </span>
    ),
  },
  {
    id: "quality",
    header: "Data quality",
    accessorFn: (row) => row.qualityScore ?? -1,
    cell: ({ row }) =>
      row.original.qualityScore === null ? (
        <span className="text-xs text-muted-foreground">not scored</span>
      ) : (
        <Badge
          variant="outline"
          className={QUALITY_TONE[row.original.qualityLevel ?? "DEFAULT"]}
          title="scoreEntry() weighted overall score"
        >
          {formatNumber(row.original.qualityScore, 0)} · {row.original.qualityLevel}
        </Badge>
      ),
  },
];

export function EntryTable({ rows }: { readonly rows: readonly EntryRow[] }) {
  return (
    <DataTable
      id="activity-entry-table"
      columns={columns}
      data={rows}
      pageSize={15}
      searchPlaceholder="Filter entries…"
      emptyState={
        <EmptyState
          title="No activity entries"
          description="Create an entry above, or import a CSV, to start the inventory."
        />
      }
    />
  );
}
