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
 * `commitDataImportJobAction` — the CSV importer has already mapped each source
 * column onto a target `ActivityDataEntry` field client-side (`csv-import.tsx`),
 * so each row arrives as `{ targetField: rawStringValue }`. Row-level shape
 * coercion and the `activityDataEntryInputSchema` checks happen per row in the
 * action, so one malformed row does not fail the whole job.
 */
export const dataImportRowInputSchema = z.record(z.string(), z.string());

export const commitDataImportJobInputSchema = z.object({
  organizationId: idSchema,
  activityDataId: idSchema,
  name: nameSchema,
  fileName: z.string().trim().max(300).nullish(),
  fileType: z.enum(["csv", "xlsx", "json"]).nullish(),
  mappings: z.array(dataImportMappingInputSchema).default([]),
  rows: z
    .array(dataImportRowInputSchema)
    .min(1, "The import must contain at least one row")
    .max(5000, "Import a maximum of 5000 rows per job"),
});
export type CommitDataImportJobInput = z.infer<typeof commitDataImportJobInputSchema>;

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
