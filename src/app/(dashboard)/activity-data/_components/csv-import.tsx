"use client";

/**
 * CSV import: parse, map, preview, commit.
 *
 * Mirrors the `DataImportJob` / `DataImportMapping` models. The user pastes or selects
 * a file, the header row is parsed, each source column is mapped to a target
 * `ActivityDataEntry` field, and the confirmed mapping plus the raw rows are handed to
 * `importActivityDataAction`.
 *
 * Parsing and mapping use the *same* pure functions the server uses
 * (`src/lib/domain/import/mapping.ts`), so the preview cannot disagree with what is
 * committed. The rows sent are the raw cells, not client-built entries: the server
 * re-derives and re-validates every row, because the action is reachable by direct
 * POST and a client-side check would be advisory only.
 *
 * The commit button used to be permanently disabled because no action existed. It is
 * now gated on the mapping being complete and a header being selected; demo mode is
 * *not* a reason to disable it — the action returns `DEMO_MODE` and the user gets a
 * real explanation rather than a dead control.
 */

import * as React from "react";
import { FileSpreadsheet, Upload } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ActionError } from "@/components/shared/form/action-error";
import { IDLE_ACTION_STATE, type ActionState } from "@/lib/actions/types";
import type { ImportActivityDataResult } from "@/lib/actions/activity-data";
import {
  IMPORT_TARGET_FIELDS,
  MAX_IMPORT_ROWS,
  guessTargetField,
  missingRequiredTargets,
  parseCsv,
  parseCsvLine,
} from "@/lib/domain/import/mapping";

/** The select options: the shared target list plus an explicit "ignore". */
const TARGET_OPTIONS = [
  { value: "", label: "— ignore —", required: false },
  ...IMPORT_TARGET_FIELDS,
] as const;

/** Re-exported so existing callers and tests keep one import site. */
export { parseCsvLine };
export const IMPORT_TARGET_FIELD_OPTIONS = TARGET_OPTIONS;

/** Guesses the target field for a source column by name. */
export function guessTarget(header: string): string {
  return guessTargetField(header);
}

export type CsvImportProps = {
  readonly databaseConfigured: boolean;
  /** Activity-data headers the imported entries can attach to. */
  readonly activityDataOptions: readonly {
    readonly value: string;
    readonly label: string;
  }[];
  readonly importActivityData: (
    input: unknown,
  ) => Promise<ActionState<ImportActivityDataResult>>;
};

export function CsvImport({
  databaseConfigured,
  activityDataOptions,
  importActivityData,
}: CsvImportProps) {
  const [raw, setRaw] = React.useState("");
  const [jobName, setJobName] = React.useState("");
  const [activityDataId, setActivityDataId] = React.useState(
    activityDataOptions[0]?.value ?? "",
  );
  /**
   * Only the user's *overrides* are held in state; the effective mapping is derived
   * from the current header row on every render, so pasting a different CSV cannot
   * leave a stale mapping behind and no effect has to reset anything.
   */
  const [overrides, setOverrides] = React.useState<Record<string, string>>({});
  const [state, setState] = React.useState<ActionState<ImportActivityDataResult>>(
    IDLE_ACTION_STATE,
  );
  const [pending, startTransition] = React.useTransition();

  const { headers, rows: allRows } = parseCsv(raw);
  const previewRows = allRows.slice(0, 5);

  const mapping: Record<string, string> = Object.fromEntries(
    headers.map((header) => [header, overrides[header] ?? guessTargetField(header)]),
  );
  const setMapping = setOverrides;

  const mappings = headers
    .filter((header) => (mapping[header] ?? "").length > 0)
    .map((header) => ({
      sourceColumn: header,
      targetField: mapping[header],
      isRequired: IMPORT_TARGET_FIELDS.some(
        (field) => field.value === mapping[header] && field.required,
      ),
    }));
  const missing = missingRequiredTargets(mappings);
  const tooManyRows = allRows.length > MAX_IMPORT_ROWS;

  const canCommit =
    headers.length > 0 &&
    allRows.length > 0 &&
    !tooManyRows &&
    missing.length === 0 &&
    activityDataId.length > 0 &&
    !pending;

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setJobName(file.name);
    setRaw(await file.text());
    setState(IDLE_ACTION_STATE);
  }

  function onCommit() {
    startTransition(async () => {
      const result = await importActivityData({
        activityDataId,
        name: jobName.trim().length > 0 ? jobName.trim() : "CSV import",
        fileName: jobName.trim().length > 0 ? jobName.trim() : null,
        fileType: "csv",
        mappings,
        rows: allRows,
      });
      setState(result);
    });
  }

  const result = state.status === "success" ? state.data : null;

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
        <Label htmlFor="csv-activity-data">Attach imported entries to</Label>
        <select
          id="csv-activity-data"
          value={activityDataId}
          onChange={(event) => setActivityDataId(event.target.value)}
          className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
        >
          {activityDataOptions.length === 0 && <option value="">No activity data set</option>}
          {activityDataOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Every imported row becomes an <code>ActivityDataEntry</code> on this set, so its
          scope and reporting year apply to the whole file.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="csv-paste">Or paste CSV</Label>
        <Textarea
          id="csv-paste"
          rows={4}
          value={raw}
          onChange={(event) => {
            setRaw(event.target.value);
            setState(IDLE_ACTION_STATE);
          }}
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
                    {TARGET_OPTIONS.map((field) => (
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
              Preview — first {previewRows.length} data row
              {previewRows.length === 1 ? "" : "s"} of {allRows.length}
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
                  {previewRows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-t">
                      {headers.map((header) => (
                        <td key={header} className="px-2 py-1 font-mono">
                          {row[header] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {tooManyRows ? (
            <Alert variant="destructive">
              <FileSpreadsheet />
              <AlertTitle>Too many rows</AlertTitle>
              <AlertDescription>
                {allRows.length} rows exceeds the {MAX_IMPORT_ROWS}-row limit for one job.
                Split the file and import it in parts.
              </AlertDescription>
            </Alert>
          ) : missing.length > 0 ? (
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
                {allRows.length} row{allRows.length === 1 ? "" : "s"} ready, mapped onto{" "}
                {mappings.length} field{mappings.length === 1 ? "" : "s"}. Each row is
                re-derived from this mapping on the server and validated by{" "}
                <code>activityImportRowSchema</code>, which enforces the same rules as a
                manually entered row.
              </AlertDescription>
            </Alert>
          )}
        </>
      )}

      <ActionError
        state={state}
        showSuccess={false}
        handledFields={["rows", "mappings", "activityDataId"]}
      />

      {result !== null && (
        <Alert
          className={result.failedRows === 0 ? "border-emerald-500/40" : "border-amber-400/60"}
          data-testid="csv-import-result"
        >
          <FileSpreadsheet
            className={result.failedRows === 0 ? "text-emerald-600" : "text-amber-600"}
          />
          <AlertTitle>
            {result.status} — {result.importedRows} of {result.totalRows} row(s) imported
          </AlertTitle>
          <AlertDescription className="space-y-2">
            <p className="text-xs">
              Import job <code>{result.jobId}</code>.
              {result.failedRows > 0
                ? ` ${result.failedRows} row(s) failed validation and were not imported.`
                : " Every row passed validation."}
            </p>
            {result.failures.length > 0 && (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium">Row</th>
                      <th className="px-2 py-1.5 text-left font-medium">Field</th>
                      <th className="px-2 py-1.5 text-left font-medium">Problem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.failures.flatMap((failure) =>
                      Object.entries(failure.fieldErrors).map(([field, messages]) => (
                        <tr key={`${failure.rowNumber}-${field}`} className="border-t">
                          <td className="px-2 py-1 font-mono">{failure.rowNumber}</td>
                          <td className="px-2 py-1 font-mono">{field}</td>
                          <td className="px-2 py-1">{messages.join(" ")}</td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </div>
            )}
            {result.truncatedFailures && (
              <p className="text-xs text-muted-foreground">
                Only the first failures are listed; the full list is stored on the import
                job&apos;s <code>errorLog</code>.
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!canCommit} onClick={onCommit}>
          <Upload className="size-3.5" />
          {pending ? "Committing…" : "Commit import job"}
        </Button>
        {!databaseConfigured && (
          <span className="text-xs text-muted-foreground">
            Committing writes a <code>DataImportJob</code> plus one entry per row, so with no{" "}
            <code>DATABASE_URL</code> it is refused with <code>DEMO_MODE</code> rather than
            faked.
          </span>
        )}
      </div>
    </div>
  );
}
