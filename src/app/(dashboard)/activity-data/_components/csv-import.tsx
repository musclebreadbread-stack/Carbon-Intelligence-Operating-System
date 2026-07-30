"use client";

/**
 * CSV import column mapping.
 *
 * Mirrors the `DataImportJob` / `DataImportMapping` models: the user pastes (or
 * selects) a file, the header row is parsed, and each source column is mapped to a
 * target `ActivityDataEntry` field. The mapping and the row preview are exactly what
 * a persisted `DataImportJob` would carry.
 *
 * Parsing and mapping happen entirely client-side; committing the job needs a
 * database, so with none configured the panel says so instead of pretending to
 * enqueue an import.
 */

import * as React from "react";
import { FileSpreadsheet, Upload } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SETUP_GUIDE_PATH } from "@/lib/i18n/messages";

/** Target fields an imported column can be mapped onto. */
export const IMPORT_TARGET_FIELDS = [
  { value: "", label: "— ignore —", required: false },
  { value: "quantity", label: "quantity", required: true },
  { value: "unit", label: "unit", required: true },
  { value: "startDate", label: "startDate", required: true },
  { value: "endDate", label: "endDate", required: true },
  { value: "emissionSourceId", label: "emissionSourceId", required: false },
  { value: "notes", label: "notes", required: false },
  { value: "evidenceUrl", label: "evidenceUrl", required: false },
  { value: "isEstimated", label: "isEstimated", required: false },
  { value: "uncertainty", label: "uncertainty", required: false },
] as const;

const REQUIRED_TARGETS = IMPORT_TARGET_FIELDS.filter((field) => field.required).map(
  (field) => field.value,
);

/** Minimal RFC-4180-ish split: quoted fields with embedded commas are honoured. */
export function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

/** Guesses the target field for a source column by name. */
export function guessTarget(header: string): string {
  const key = header.toLowerCase().replace(/[^a-z]/g, "");
  const table: Readonly<Record<string, string>> = {
    quantity: "quantity",
    amount: "quantity",
    value: "quantity",
    consumption: "quantity",
    unit: "unit",
    uom: "unit",
    startdate: "startDate",
    periodstart: "startDate",
    from: "startDate",
    enddate: "endDate",
    periodend: "endDate",
    to: "endDate",
    source: "emissionSourceId",
    emissionsource: "emissionSourceId",
    notes: "notes",
    memo: "notes",
    evidence: "evidenceUrl",
    evidenceurl: "evidenceUrl",
    estimated: "isEstimated",
    isestimated: "isEstimated",
    uncertainty: "uncertainty",
  };
  return table[key] ?? "";
}

export function CsvImport({ databaseConfigured }: { readonly databaseConfigured: boolean }) {
  const [raw, setRaw] = React.useState("");
  const [jobName, setJobName] = React.useState("");
  /**
   * Only the user's *overrides* are held in state; the effective mapping is derived
   * from the current header row on every render, so pasting a different CSV cannot
   * leave a stale mapping behind and no effect has to reset anything.
   */
  const [overrides, setOverrides] = React.useState<Record<string, string>>({});

  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const headers = lines.length > 0 ? parseCsvLine(lines[0]) : [];
  const rows = lines.slice(1, 6).map(parseCsvLine);

  const mapping: Record<string, string> = Object.fromEntries(
    headers.map((header) => [header, overrides[header] ?? guessTarget(header)]),
  );
  const setMapping = setOverrides;

  const mapped = Object.values(mapping).filter((target) => target.length > 0);
  const missing = REQUIRED_TARGETS.filter((target) => !mapped.includes(target));

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setJobName(file.name);
    setRaw(await file.text());
  }

  return (
    <div className="space-y-4" data-testid="csv-import">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="csv-file">CSV file</Label>
          <Input id="csv-file" type="file" accept=".csv,text/csv" onChange={onFile} />
          <p className="text-xs text-muted-foreground">
            Parsed in the browser. Nothing leaves the page until the job is committed.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="csv-job-name">Import job name</Label>
          <Input
            id="csv-job-name"
            value={jobName}
            onChange={(event) => setJobName(event.target.value)}
            placeholder="2024 Q1 gas meters.csv"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="csv-paste">Or paste CSV</Label>
        <Textarea
          id="csv-paste"
          rows={4}
          value={raw}
          onChange={(event) => setRaw(event.target.value)}
          placeholder="quantity,unit,startDate,endDate&#10;12500,kWh,2024-01-01,2024-01-31"
          className="font-mono text-xs"
        />
      </div>

      {headers.length > 0 && (
        <>
          <div className="space-y-2">
            <p className="text-sm font-medium">Column mapping</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {headers.map((header) => (
                <div key={header} className="flex items-center gap-2">
                  <span
                    className="w-40 shrink-0 truncate font-mono text-xs"
                    title={header}
                  >
                    {header}
                  </span>
                  <span className="text-muted-foreground">→</span>
                  <select
                    aria-label={`Map column ${header}`}
                    value={mapping[header] ?? ""}
                    onChange={(event) =>
                      setMapping((previous) => ({ ...previous, [header]: event.target.value }))
                    }
                    className="h-8 flex-1 rounded-lg border border-input bg-background px-2 text-sm"
                  >
                    {IMPORT_TARGET_FIELDS.map((field) => (
                      <option key={field.value} value={field.value}>
                        {field.label}
                        {field.required ? " *" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">
              Preview — first {rows.length} data row{rows.length === 1 ? "" : "s"} of{" "}
              {lines.length - 1}
            </p>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    {headers.map((header) => (
                      <th key={header} className="px-2 py-1.5 text-left font-medium">
                        {mapping[header] || <span className="text-muted-foreground">ignored</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-t">
                      {headers.map((header, columnIndex) => (
                        <td key={header} className="px-2 py-1 font-mono">
                          {row[columnIndex] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {missing.length > 0 ? (
            <Alert variant="destructive">
              <FileSpreadsheet />
              <AlertTitle>Mapping incomplete</AlertTitle>
              <AlertDescription>
                Required target field{missing.length === 1 ? "" : "s"} not mapped:{" "}
                {missing.map((field) => (
                  <Badge key={field} variant="outline" className="ml-1">
                    {field}
                  </Badge>
                ))}
              </AlertDescription>
            </Alert>
          ) : (
            <Alert className="border-emerald-500/40">
              <FileSpreadsheet className="text-emerald-600" />
              <AlertTitle>Mapping complete</AlertTitle>
              <AlertDescription>
                {lines.length - 1} row{lines.length - 1 === 1 ? "" : "s"} ready, mapped onto{" "}
                {mapped.length} field{mapped.length === 1 ? "" : "s"}. Each row will be validated
                by <code>activityDataEntryInputSchema</code> and run through the active rule
                sets, exactly as a manually entered row is.
              </AlertDescription>
            </Alert>
          )}
        </>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!databaseConfigured || missing.length > 0 || headers.length === 0}>
          <Upload className="size-3.5" />
          Commit import job
        </Button>
        {!databaseConfigured && (
          <span className="text-xs text-muted-foreground">
            Committing an import writes a <code>DataImportJob</code> plus one entry per row, so it
            needs <code>DATABASE_URL</code>. See <code>{SETUP_GUIDE_PATH}</code>.
          </span>
        )}
      </div>
    </div>
  );
}
