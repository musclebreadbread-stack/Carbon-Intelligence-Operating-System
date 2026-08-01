/**
 * Validation schemas for activity data — the layer the whole inventory rests on.
 *
 * Three rules are enforced here that the database cannot express:
 *   - `quantity` must be strictly positive (a zero-quantity entry is a data
 *     error, not a zero-emission activity; use `isEstimated` with a real value)
 *   - `endDate` must be on or after `startDate`
 *   - `unit` must exist in the item-4 unit registry, otherwise the conversion
 *     engine would throw at calculation time instead of at entry time
 */

import { z } from "zod";

import { MAX_IMPORT_ROWS } from "@/lib/domain/import/mapping";

import {
  dataQualityLevelSchema,
  dataSourceTypeSchema,
  dateSchema,
  descriptionSchema,
  fractionSchema,
  ghgScopeSchema,
  idSchema,
  importStatusSchema,
  monthSchema,
  nameSchema,
  nonNegativeNumber,
  positiveNumber,
  registryUnitSchema,
  scope3CategorySchema,
  urlSchema,
  yearSchema,
} from "./common";

/** `ActivityData` — the header grouping a set of entries. */
export const activityDataInputSchema = z
  .object({
    organizationId: idSchema,
    facilityId: idSchema.nullish(),
    businessUnitId: idSchema.nullish(),
    name: nameSchema,
    description: descriptionSchema.nullish(),
    scope: ghgScopeSchema,
    scope3Category: scope3CategorySchema.nullish(),
    reportingYear: yearSchema,
    reportingMonth: monthSchema.nullish(),
    dataSource: dataSourceTypeSchema.default("MANUAL_ENTRY"),
    dataQuality: dataQualityLevelSchema.default("MEDIUM"),
    isVerified: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    if (value.scope === "SCOPE_3" && !value.scope3Category) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scope3Category"],
        message: "A Scope 3 activity data set must declare a scope3Category",
      });
    }
    if (value.scope !== "SCOPE_3" && value.scope3Category) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scope3Category"],
        message: "scope3Category is only valid on Scope 3 activity data",
      });
    }
  });
export type ActivityDataInput = z.infer<typeof activityDataInputSchema>;

/** The master-data references an entry may carry; all optional. */
const entityReferences = {
  emissionSourceId: idSchema.nullish(),
  productId: idSchema.nullish(),
  supplierId: idSchema.nullish(),
  vehicleId: idSchema.nullish(),
  fuelId: idSchema.nullish(),
  refrigerantId: idSchema.nullish(),
  rawMaterialId: idSchema.nullish(),
  logisticsRouteId: idSchema.nullish(),
  energySourceId: idSchema.nullish(),
  wasteTypeId: idSchema.nullish(),
  waterSourceId: idSchema.nullish(),
};

export const activityDataEntryInputSchema = z
  .object({
    activityDataId: idSchema,
    quantity: positiveNumber,
    unit: registryUnitSchema,
    startDate: dateSchema,
    endDate: dateSchema,
    notes: descriptionSchema.nullish(),
    evidenceUrl: urlSchema.nullish(),
    isEstimated: z.boolean().default(false),
    /** Relative uncertainty of the quantity, as a 0..1 fraction. */
    uncertainty: fractionSchema.nullish(),
    ...entityReferences,
  })
  .refine((value) => value.endDate.getTime() >= value.startDate.getTime(), {
    message: "endDate must be on or after startDate",
    path: ["endDate"],
  });
export type ActivityDataEntryInput = z.infer<typeof activityDataEntryInputSchema>;

/**
 * Update payload. The id is required; every other field is optional so a partial
 * form submission does not clear untouched columns.
 */
export const activityDataEntryUpdateSchema = z
  .object({
    id: idSchema,
    quantity: positiveNumber.optional(),
    unit: registryUnitSchema.optional(),
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
    notes: descriptionSchema.nullish(),
    evidenceUrl: urlSchema.nullish(),
    isEstimated: z.boolean().optional(),
    uncertainty: fractionSchema.nullish(),
    ...entityReferences,
  })
  .refine(
    (value) =>
      value.startDate === undefined ||
      value.endDate === undefined ||
      value.endDate.getTime() >= value.startDate.getTime(),
    { message: "endDate must be on or after startDate", path: ["endDate"] },
  );
export type ActivityDataEntryUpdate = z.infer<typeof activityDataEntryUpdateSchema>;

/** Filter accepted by the activity-data repository and the REST list endpoint. */
export const activityDataQuerySchema = z.object({
  organizationId: idSchema,
  facilityId: idSchema.optional(),
  businessUnitId: idSchema.optional(),
  scope: ghgScopeSchema.optional(),
  scope3Category: scope3CategorySchema.optional(),
  reportingYear: z.coerce.number().int().min(1900).max(2100).optional(),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
});
export type ActivityDataQuery = z.infer<typeof activityDataQuerySchema>;

/** `DataValidationRule` — the row-level checks applied during CSV import. */
export const dataValidationRuleInputSchema = z.object({
  name: nameSchema,
  field: z.string().trim().min(1).max(80),
  ruleType: z.enum(["required", "range", "enum", "regex", "comparison"]),
  condition: z.string().trim().min(1).max(500),
  errorMessage: z.string().trim().min(1).max(300),
  severity: z.enum(["error", "warning", "info"]).default("error"),
  isActive: z.boolean().default(true),
});
export type DataValidationRuleInput = z.infer<typeof dataValidationRuleInputSchema>;

export const dataImportMappingInputSchema = z.object({
  sourceColumn: z.string().trim().min(1).max(120),
  targetField: z.string().trim().min(1).max(80),
  transformation: z.string().trim().max(200).nullish(),
  defaultValue: z.string().trim().max(200).nullish(),
  isRequired: z.boolean().default(false),
});
export type DataImportMappingInput = z.infer<typeof dataImportMappingInputSchema>;

export const dataImportJobInputSchema = z.object({
  organizationId: idSchema,
  name: nameSchema,
  fileName: z.string().trim().max(300).nullish(),
  fileUrl: urlSchema.nullish(),
  fileType: z.enum(["csv", "xlsx", "json"]).nullish(),
  status: importStatusSchema.default("PENDING"),
  totalRows: z.number().int().nonnegative().nullish(),
  mappings: z.array(dataImportMappingInputSchema).default([]),
});
export type DataImportJobInput = z.infer<typeof dataImportJobInputSchema>;

/**
 * One projected CSV row.
 *
 * Separate from `activityDataEntryInputSchema` because the value types differ at the
 * boundary, not because the rules do: a CSV cell is always a string, so `quantity`,
 * `uncertainty` and `isEstimated` need coercion, while the form schema receives them
 * already typed. The *constraints* are deliberately identical — positive quantity,
 * registry unit, `endDate >= startDate`, uncertainty as a 0–1 fraction — so an
 * imported row cannot enter the inventory under weaker validation than a hand-typed
 * one. That equivalence is asserted in `activity-data.test.ts`.
 */
export const activityImportRowSchema = z
  .object({
    quantity: z.coerce
      .number({ invalid_type_error: "quantity must be a number" })
      .finite("quantity must be a finite number")
      .positive("quantity must be greater than zero"),
    unit: registryUnitSchema,
    startDate: dateSchema,
    endDate: dateSchema,
    emissionSourceId: idSchema.optional(),
    notes: descriptionSchema.optional(),
    evidenceUrl: urlSchema.optional(),
    // CSV has no booleans. Accepting the spellings a spreadsheet actually produces
    // is friendlier than rejecting the row, but anything else is an error rather
    // than a silent `false`.
    isEstimated: z
      .string()
      .trim()
      .transform((value) => value.toLowerCase())
      .refine(
        (value) => ["true", "false", "yes", "no", "y", "n", "1", "0"].includes(value),
        { message: 'isEstimated must be one of true/false, yes/no, y/n, 1/0' },
      )
      .transform((value) => ["true", "yes", "y", "1"].includes(value))
      .optional(),
    uncertainty: z.coerce
      .number({ invalid_type_error: "uncertainty must be a number" })
      .min(0, "uncertainty is a 0–1 fraction")
      .max(1, "uncertainty is a 0–1 fraction")
      .optional(),
  })
  .refine((value) => value.endDate.getTime() >= value.startDate.getTime(), {
    message: "endDate must be on or after startDate",
    path: ["endDate"],
  });
export type ActivityImportRow = z.infer<typeof activityImportRowSchema>;

/**
 * The CSV import commit payload.
 *
 * `rows` carries the *raw* cells rather than pre-validated entries, so the server
 * re-derives everything from the mapping the user confirmed. Trusting a client-parsed
 * entry list would make the row-level validation advisory, and this action is
 * reachable by direct POST.
 */
export const activityDataImportInputSchema = z.object({
  organizationId: idSchema,
  /** The `ActivityData` header the imported entries attach to. */
  activityDataId: idSchema,
  name: nameSchema,
  fileName: z.string().trim().max(300).nullish(),
  fileType: z.enum(["csv", "xlsx", "json"]).default("csv"),
  mappings: z
    .array(dataImportMappingInputSchema)
    .min(1, "Map at least one column before committing the import"),
  rows: z
    .array(z.record(z.string(), z.string()))
    .min(1, "The file has a header row but no data rows")
    .max(MAX_IMPORT_ROWS, `An import is limited to ${MAX_IMPORT_ROWS} rows`),
});
export type ActivityDataImportInput = z.infer<typeof activityDataImportInputSchema>;

/** `MeterReading` / `IoTReading` payload. */
export const meterReadingInputSchema = z
  .object({
    facilityId: idSchema,
    meterId: z.string().trim().min(1).max(80),
    meterType: z.string().trim().min(1).max(60),
    readingDate: dateSchema,
    previousReading: nonNegativeNumber.nullish(),
    currentReading: nonNegativeNumber,
    consumption: nonNegativeNumber,
    unit: registryUnitSchema,
    isEstimated: z.boolean().default(false),
  })
  .refine(
    (value) =>
      value.previousReading === null ||
      value.previousReading === undefined ||
      value.currentReading >= value.previousReading,
    {
      message: "currentReading must be at least previousReading",
      path: ["currentReading"],
    },
  );
export type MeterReadingInput = z.infer<typeof meterReadingInputSchema>;
