/**
 * CSV import column mapping.
 *
 * Pure TypeScript — no framework, database or network imports — so both the client
 * preview and the server action can use one implementation. That matters more here
 * than elsewhere: the mapping shown in the preview and the mapping the server applies
 * have to be the same function, or the user commits an import that does not match
 * what they were shown.
 *
 * Cell values stay strings at this layer. Coercion is the validation layer's job
 * (`activityImportRowSchema`), so a row that fails to coerce produces a reportable
 * per-row error instead of a silent `NaN`.
 */

/** Target `ActivityDataEntry` fields an imported column can be mapped onto. */
export const IMPORT_TARGET_FIELDS = [
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

export type ImportTargetField = (typeof IMPORT_TARGET_FIELDS)[number]["value"];

/** Target fields an import cannot proceed without. */
export const REQUIRED_IMPORT_TARGETS: readonly ImportTargetField[] = IMPORT_TARGET_FIELDS
  .filter((field) => field.required)
  .map((field) => field.value);

/**
 * Upper bound on rows in a single commit.
 *
 * A Server Action body is bounded (Next's default is 1 MB) and the whole job is
 * written in one transaction, so an unbounded import would fail late and opaquely.
 * Refusing it up front with a countable limit is a better failure.
 */
export const MAX_IMPORT_ROWS = 5_000;

export function isImportTargetField(value: string): value is ImportTargetField {
  return IMPORT_TARGET_FIELDS.some((field) => field.value === value);
}

/** One `DataImportMapping`: a source column bound to a target field. */
export type ImportMappingLike = {
  readonly sourceColumn: string;
  readonly targetField: string;
  readonly defaultValue?: string | null;
};

/**
 * Guesses the target field for a source column by name.
 *
 * Deliberately conservative: an unrecognised header maps to nothing rather than to
 * whichever field is alphabetically closest, because a wrong guess the user does not
 * notice is worse than no guess.
 */
const HEADER_ALIASES: Readonly<Record<string, ImportTargetField>> = {
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
  emissionsourceid: "emissionSourceId",
  notes: "notes",
  memo: "notes",
  evidence: "evidenceUrl",
  evidenceurl: "evidenceUrl",
  estimated: "isEstimated",
  isestimated: "isEstimated",
  uncertainty: "uncertainty",
};

export function guessTargetField(header: string): ImportTargetField | "" {
  const key = header.toLowerCase().replace(/[^a-z]/g, "");
  return HEADER_ALIASES[key] ?? "";
}

/**
 * Which required target fields the mapping does not cover.
 *
 * A target mapped from two columns still counts as covered once; a mapping whose
 * target is empty is an explicit "ignore this column".
 */
export function missingRequiredTargets(
  mappings: readonly ImportMappingLike[],
): readonly ImportTargetField[] {
  const mapped = new Set(
    mappings
      .map((mapping) => mapping.targetField)
      .filter((target): target is ImportTargetField => isImportTargetField(target)),
  );
  return REQUIRED_IMPORT_TARGETS.filter((target) => !mapped.has(target));
}

/**
 * Projects one raw CSV row onto its target fields.
 *
 * A blank cell falls back to the mapping's `defaultValue` and, failing that, is
 * omitted entirely rather than passed on as `""` — an omitted optional field is
 * valid, an empty string usually is not. Unrecognised targets and columns mapped to
 * nothing are dropped, which is what makes "— ignore —" work.
 */
export function projectImportRow(
  mappings: readonly ImportMappingLike[],
  row: Readonly<Record<string, string>>,
): Record<string, string> {
  const projected: Record<string, string> = {};
  for (const mapping of mappings) {
    if (!isImportTargetField(mapping.targetField)) continue;
    const raw = row[mapping.sourceColumn];
    const value = raw !== undefined && raw.trim().length > 0 ? raw.trim() : (mapping.defaultValue ?? "");
    if (value.trim().length === 0) continue;
    projected[mapping.targetField] = value.trim();
  }
  return projected;
}

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

/**
 * Splits a whole CSV document into a header row and data rows keyed by header.
 *
 * Blank lines are dropped. A row with fewer cells than the header gets empty strings
 * for the missing ones, so a short trailing row reports as a row-level validation
 * failure rather than shifting every subsequent column.
 */
export function parseCsv(text: string): {
  readonly headers: readonly string[];
  readonly rows: readonly Record<string, string>[];
} {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  });
  return { headers, rows };
}
