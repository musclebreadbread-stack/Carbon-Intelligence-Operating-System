"use client";

/**
 * CSV import column mapping.
 *
 * Mirrors the `DataImportJob` / `DataImportMapping` models: the user pastes (or
 * selects) a file, the header row is parsed, and each source column is mapped to a
 * target `ActivityDataEntry` field. The mapping and the row preview are exactly what
 * a persisted `DataImportJob` would carry.
 *
 * Parsing and mapping happen entirely client-side. Committing needs a database and
 * a target activity data set; with neither configured the panel says so instead of
 * pretending to enqueue an import. `commitDataImportJobAction` validates each row
 * server-side and reports partial success — one bad row does not fail the job.
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
import { useT } from "@/components/providers/locale-provider";
import { IDLE_ACTION_STATE, type ActionState } from "@/lib/actions/types";
import { SETUP_GUIDE_PATH } from "@/lib/i18n/messages";

export type CommitDataImportJobResult = {
  readonly jobId: string;
  readonly totalRows: number;
  readonly processedRows: number;
  readonly errorRows: number;
  readonly rowErrors: readonly { readonly rowIndex: number; readonly errors: readonly string[] }[];
};

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

export type CsvImportProps = {
  readonly databaseConfigured: boolean;
  readonly activityDataOptions: readonly { readonly value: string; readonly label: string }[];
  readonly commitImport: (input: unknown) => Promise<ActionState<CommitDataImportJobResult>>;
};

export function CsvImport({ databaseConfigured, activityDataOptions, commitImport }: CsvImportProps) {
  const t = useT();
  const [raw, setRaw] = React.useState("");
  const [jobName, setJobName] = React.useState("");
  const [activityDataId, setActivityDataId] = React.useState(activityDataOptions[0]?.value ?? "");
  /**
   * Only the user's *overrides* are held in state; the effective mapping is derived
   * from the current header row on every render, so pasting a different CSV cannot
   * leave a stale mapping behind and no effect has to reset anything.
   */
  const [overrides, setOverrides] = React.useState<Record<string, string>>({});
  const [state, setState] = React.useState<ActionState<CommitDataImportJobResult>>(
    IDLE_ACTION_STATE as ActionState<CommitDataImportJobResult>,
  );
  const [pending, setPending] = React.useState(false);

  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const headers = lines.length > 0 ? parseCsvLine(lines[0]) : [];
  const dataLines = lines.slice(1);
  const rows = dataLines.slice(0, 5).map(parseCsvLine);

  const mapping: Record<string, string> = Object.fromEntries(
    headers.map((header) => [header, overrides[header] ?? guessTarget(header)]),
  );
  const setMapping = setOverrides;

  const mapped = Object.values(mapping).filter((target) => target.length > 0);
  const missing = REQUIRED_TARGETS.filter((target) => !mapped.includes(target));
  const canCommit =
    databaseConfigured && missing.length === 0 && headers.length > 0 && activityDataId.length > 0;

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setJobName(file.name);
    setRaw(await file.text());
  }

  async function onCommit() {
    if (!canCommit) return;
    setPending(true);
    try {
      const mappedRows = dataLines.map((line) => {
        const cells = parseCsvLine(line);
        const row: Record<string, string> = {};
        headers.forEach((header, index) => {
          const target = mapping[header];
          if (target && cells[index] !== undefined && cells[index] !== "") {
            row[target] = cells[index];
          }
        });
        return row;
      });

      const result = await commitImport({
        activityDataId,
        name: jobName || "CSV import",
        fileName: jobName || null,
        fileType: "csv",
        mappings: headers.map((header) => ({
          sourceColumn: header,
          targetField: mapping[header] || "",
          isRequired: REQUIRED_TARGETS.includes(mapping[header] as (typeof REQUIRED_TARGETS)[number]),
        })),
        rows: mappedRows,
      });
      setState(result);
      if (result.status === "success") {
        setRaw("");
        setJobName("");
        setOverrides({});
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="csv-import">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="csv-file">{t("csvImport.csvFile")}</Label>
          <Input id="csv-file" type="file" accept=".csv,text/csv" onChange={onFile} />
          <p className="text-xs text-muted-foreground">{t("csvImport.csvFileHint")}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="csv-job-name">{t("csvImport.importJobName")}</Label>
          <Input
            id="csv-job-name"
            value={jobName}
            onChange={(event) => setJobName(event.target.value)}
            placeholder="2024 Q1 gas meters.csv"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="csv-activity-data">{t("csvImport.activityDataSet")}</Label>
          <select
            id="csv-activity-data"
            value={activityDataId}
            onChange={(event) => setActivityDataId(event.target.value)}
            className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
          >
            {activityDataOptions.length === 0 && (
              <option value="">{t("csvImport.noDataSetsOption")}</option>
            )}
            {activityDataOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            {t("csvImport.everyImportedRowPrefix")} <code>ActivityDataEntry</code>{" "}
            {t("csvImport.everyImportedRowSuffix")}
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="csv-paste">{t("csvImport.orPasteCsv")}</Label>
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
            <p className="text-sm font-medium">{t("csvImport.columnMapping")}</p>
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
                    aria-label={`${t("csvImport.mapColumnAriaLabel")} ${header}`}
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
              {t("csvImport.previewFirst")} {rows.length}{" "}
              {rows.length === 1 ? t("csvImport.dataRow") : t("csvImport.dataRows")}{" "}
              {t("csvImport.of")} {dataLines.length}
            </p>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    {headers.map((header) => (
                      <th key={header} className="px-2 py-1.5 text-left font-medium">
                        {mapping[header] || (
                          <span className="text-muted-foreground">{t("csvImport.ignored")}</span>
                        )}
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
              <AlertTitle>{t("csvImport.mappingIncompleteTitle")}</AlertTitle>
              <AlertDescription>
                {missing.length === 1
                  ? t("csvImport.requiredFieldNotMapped")
                  : t("csvImport.requiredFieldsNotMapped")}{" "}
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
              <AlertTitle>{t("csvImport.mappingCompleteTitle")}</AlertTitle>
              <AlertDescription>
                {dataLines.length} {dataLines.length === 1 ? t("csvImport.row") : t("csvImport.rows")}{" "}
                {t("csvImport.readyMappedOnto")}{" "}
                {mapped.length} {mapped.length === 1 ? t("csvImport.field") : t("csvImport.fields")}.{" "}
                {t("csvImport.mappingCompleteDetailPrefix")}{" "}
                <code>activityDataEntryInputSchema</code>{" "}
                {t("csvImport.mappingCompleteDetailSuffix")}
              </AlertDescription>
            </Alert>
          )}
        </>
      )}

      <ActionError state={state} showSuccess={false} />

      {state.status === "success" && (
        <Alert
          className={state.data.errorRows > 0 ? "border-amber-500/40" : "border-emerald-500/40"}
          data-testid="csv-import-result"
        >
          <FileSpreadsheet
            className={state.data.errorRows > 0 ? "text-amber-600" : "text-emerald-600"}
          />
          <AlertTitle>
            {t("csvImport.importedPrefix")} {state.data.processedRows} {t("csvImport.of")}{" "}
            {state.data.totalRows} {t("csvImport.rowsParenS")}
          </AlertTitle>
          <AlertDescription>
            {state.data.errorRows > 0 ? (
              <>
                <p>
                  {state.data.errorRows} {t("csvImport.rowsParenS")}{" "}
                  {t("csvImport.rowsRejectedSuffix")}
                </p>
                <ul className="mt-1 list-inside list-disc text-xs">
                  {state.data.rowErrors.slice(0, 10).map((rowError) => (
                    <li key={rowError.rowIndex}>
                      {t("csvImport.rowLabel")} {rowError.rowIndex + 1}:{" "}
                      {rowError.errors.join("; ")}
                    </li>
                  ))}
                  {state.data.rowErrors.length > 10 && (
                    <li>
                      {t("csvImport.andMorePrefix")} {state.data.rowErrors.length - 10}{" "}
                      {t("csvImport.moreSuffix")}
                    </li>
                  )}
                </ul>
              </>
            ) : (
              t("csvImport.everyRowPassed")
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!canCommit || pending} onClick={onCommit}>
          <Upload className="size-3.5" />
          {pending ? t("csvImport.committing") : t("csvImport.commitImportJob")}
        </Button>
        {!databaseConfigured && (
          <span className="text-xs text-muted-foreground">
            {t("csvImport.databaseUrlHintPrefix")} <code>DataImportJob</code>{" "}
            {t("csvImport.databaseUrlHintMiddle")} <code>DATABASE_URL</code>.{" "}
            {t("csvImport.databaseUrlHintSuffix")} <code>{SETUP_GUIDE_PATH}</code>.
          </span>
        )}
        {databaseConfigured && activityDataOptions.length === 0 && (
          <span className="text-xs text-muted-foreground">
            {t("csvImport.createActivityDataSetHint")}
          </span>
        )}
      </div>
    </div>
  );
}
