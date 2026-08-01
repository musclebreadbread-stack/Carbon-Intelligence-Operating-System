"use client";

/** Versioned emission-factor library with validity filtering. */

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { DataTable, type ColumnDef } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { FormField } from "@/components/shared/form/form-field";
import { formatDate, formatNumber, humaniseEnum, scopeLabel } from "@/lib/format";

export type FactorTableRow = {
  readonly id: string;
  readonly name: string;
  readonly value: number;
  readonly unit: string;
  readonly gasType: string | null;
  /** `null` on a factor that applies to any scope. */
  readonly scope: string | null;
  readonly scope3Category: string | null;
  readonly region: string | null;
  readonly country: string | null;
  readonly sector: string | null;
  readonly validFrom: string | null;
  readonly validTo: string | null;
  readonly isActive: boolean;
  readonly uncertainty: number | null;
  readonly dataQuality: string | null;
  readonly sourceName: string | null;
  readonly versionLabel: string | null;
  readonly organizationSpecific: boolean;
};

const columns: ColumnDef<FactorTableRow, unknown>[] = [
  { id: "name", header: "Factor", accessorFn: (row) => row.name },
  {
    id: "value",
    header: "Value",
    accessorFn: (row) => row.value,
    cell: ({ row }) => (
      <span className="font-mono text-xs">
        {formatNumber(row.original.value, 5)} {row.original.unit}
      </span>
    ),
  },
  {
    id: "gas",
    header: "Gas",
    accessorFn: (row) => row.gasType ?? "CO2e",
  },
  {
    id: "scope",
    header: "Scope",
    accessorFn: (row) => row.scope ?? "any",
    cell: ({ row }) => (
      <div className="space-y-0.5">
        <Badge variant="secondary">
          {row.original.scope ? scopeLabel(row.original.scope) : "any scope"}
        </Badge>
        {row.original.scope3Category && (
          <p className="text-[11px] text-muted-foreground">
            {humaniseEnum(row.original.scope3Category)}
          </p>
        )}
      </div>
    ),
  },
  {
    id: "geography",
    header: "Geography",
    accessorFn: (row) => `${row.country ?? ""} ${row.region ?? ""}`.trim(),
    cell: ({ row }) => (
      <span className="text-xs">
        {row.original.country ?? row.original.region ?? "global"}
      </span>
    ),
  },
  { id: "sector", header: "Sector", accessorFn: (row) => row.sector ?? "—" },
  {
    id: "validity",
    header: "Validity",
    accessorFn: (row) => row.validFrom ?? "",
    cell: ({ row }) => (
      <span className="font-mono text-[11px]">
        {formatDate(row.original.validFrom)} → {row.original.validTo ? formatDate(row.original.validTo) : "open"}
      </span>
    ),
  },
  {
    id: "source",
    header: "Source / version",
    accessorFn: (row) => `${row.sourceName ?? ""} ${row.versionLabel ?? ""}`.trim(),
    cell: ({ row }) => (
      <div className="space-y-0.5 text-xs">
        <p>{row.original.sourceName ?? "unsourced"}</p>
        {row.original.versionLabel && (
          <p className="text-muted-foreground">v{row.original.versionLabel}</p>
        )}
      </div>
    ),
  },
  {
    id: "specificity",
    header: "Specificity",
    accessorFn: (row) => (row.organizationSpecific ? "organization" : "published"),
    cell: ({ row }) => (
      <Badge variant={row.original.organizationSpecific ? "default" : "outline"}>
        {row.original.organizationSpecific ? "organization" : "published"}
      </Badge>
    ),
  },
  {
    id: "quality",
    header: "Quality",
    accessorFn: (row) => row.dataQuality ?? "",
    cell: ({ row }) => (
      <div className="space-y-0.5 text-xs">
        <p>{row.original.dataQuality ?? "—"}</p>
        {row.original.uncertainty !== null && (
          <p className="text-muted-foreground">
            ±{formatNumber((row.original.uncertainty ?? 0) * 100, 1)}%
          </p>
        )}
      </div>
    ),
  },
  {
    id: "status",
    header: "Status",
    accessorFn: (row) => (row.isActive ? "active" : "superseded"),
    cell: ({ row }) => (
      <Badge variant={row.original.isActive ? "secondary" : "outline"}>
        {row.original.isActive ? "active" : "superseded"}
      </Badge>
    ),
  },
];

export function FactorTable({
  rows,
  scopes,
  sources,
}: {
  readonly rows: readonly FactorTableRow[];
  readonly scopes: readonly { readonly value: string; readonly label: string }[];
  readonly sources: readonly { readonly value: string; readonly label: string }[];
}) {
  const [scope, setScope] = React.useState("");
  const [source, setSource] = React.useState("");
  const [validOn, setValidOn] = React.useState("");
  const [includeSuperseded, setIncludeSuperseded] = React.useState(false);

  const filtered = rows.filter((row) => {
    if (scope && row.scope !== scope) return false;
    if (source && row.sourceName !== source) return false;
    if (!includeSuperseded && !row.isActive) return false;
    if (validOn) {
      const at = new Date(validOn).getTime();
      if (Number.isFinite(at)) {
        if (row.validFrom && at < new Date(row.validFrom).getTime()) return false;
        if (row.validTo && at > new Date(row.validTo).getTime()) return false;
      }
    }
    return true;
  });

  return (
    <div className="space-y-3" data-testid="factor-library">
      <div className="grid gap-3 sm:grid-cols-4">
        <FormField
          name="factor-scope"
          label="Scope"
          type="select"
          options={scopes}
          inputProps={{
            value: scope,
            onChange: (event: React.ChangeEvent<HTMLSelectElement>) =>
              setScope(event.target.value),
          }}
        />
        <FormField
          name="factor-source"
          label="Source"
          type="select"
          options={sources}
          inputProps={{
            value: source,
            onChange: (event: React.ChangeEvent<HTMLSelectElement>) =>
              setSource(event.target.value),
          }}
        />
        <FormField
          name="factor-valid-on"
          label="Valid on"
          type="date"
          description="Excludes factors whose window does not cover the date."
          inputProps={{
            value: validOn,
            onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
              setValidOn(event.target.value),
          }}
        />
        <FormField
          name="factor-include-superseded"
          label="Include superseded versions"
          type="checkbox"
          inputProps={{
            checked: includeSuperseded,
            onCheckedChange: (checked: boolean) => setIncludeSuperseded(checked === true),
          }}
        />
      </div>

      <DataTable
        id="factor-table"
        columns={columns}
        data={filtered}
        pageSize={15}
        searchPlaceholder="Filter factors…"
        emptyState={
          <EmptyState
            title="No factors match"
            description="Relax the validity date or include superseded versions."
          />
        }
      />
    </div>
  );
}
