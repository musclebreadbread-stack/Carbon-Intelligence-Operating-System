/**
 * Validation schemas for calculation runs and their persisted output.
 *
 * The run request deliberately does *not* carry activity entries or candidate
 * factors: the action reads those from the repository for the requested period so
 * a caller cannot smuggle in numbers that were never recorded as activity data.
 */

import { z } from "zod";

import { SCOPE1_SOURCE_TYPES } from "@/lib/domain/emissions/orchestrator";
import { MEASUREMENT_TYPES } from "@/lib/domain/quality/score";

import {
  calculationApproachSchema,
  consolidationApproachSchema,
  dataQualityLevelSchema,
  dateSchema,
  descriptionSchema,
  finiteNumber,
  ghgScopeSchema,
  gwpVersionSchema,
  idSchema,
  nameSchema,
  nonNegativeNumber,
  registryUnitSchema,
  reportingPeriodSchema,
  scope2BasisSchema,
  scope3CategorySchema,
  yearSchema,
} from "./common";

export const scope1SourceTypeSchema = z.enum(SCOPE1_SOURCE_TYPES);
export const measurementTypeSchema = z.enum(MEASUREMENT_TYPES);

export const monteCarloOptionsSchema = z.object({
  iterations: z.number().int().min(100).max(200_000).default(10_000),
  /** Required: an unseeded run would not be reproducible by a verifier. */
  seed: z.number().int(),
  confidenceLevel: z.number().min(50).max(99.9).default(95),
});
export type MonteCarloOptionsInput = z.infer<typeof monteCarloOptionsSchema>;

export const runCalculationRequestSchema = z
  .object({
    organizationId: idSchema,
    name: nameSchema,
    reportingYear: yearSchema,
    period: reportingPeriodSchema.optional(),
    gwpVersion: gwpVersionSchema.default("AR6"),
    approach: calculationApproachSchema.default("ACTIVITY_BASED"),
    consolidationApproach: consolidationApproachSchema.default("OPERATIONAL_CONTROL"),
    scope2Basis: scope2BasisSchema.default("LOCATION"),
    /** Restrict the run to a subset of the hierarchy; empty means everything. */
    facilityIds: z.array(idSchema).default([]),
    scopes: z.array(ghgScopeSchema).default([]),
    monteCarlo: monteCarloOptionsSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.period) return;
    const startYear = value.period.start.getUTCFullYear();
    const endYear = value.period.end.getUTCFullYear();
    if (value.reportingYear < startYear || value.reportingYear > endYear) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reportingYear"],
        message: "reportingYear must fall inside the reporting period",
      });
    }
  });
export type RunCalculationRequestInput = z.infer<typeof runCalculationRequestSchema>;

/**
 * One entry as handed to the orchestrator. Used when a caller supplies entries
 * directly — the REST API's stateless calculate endpoint and the agent tool.
 */
export const calculationEntrySchema = z
  .object({
    id: idSchema,
    name: nameSchema.optional(),
    quantity: finiteNumber,
    unit: registryUnitSchema,
    dataPeriod: reportingPeriodSchema.optional(),
    scope: ghgScopeSchema,
    scope3Category: scope3CategorySchema.nullish(),
    scope1SourceType: scope1SourceTypeSchema.optional(),
    approach: calculationApproachSchema.optional(),
    region: z.string().trim().max(120).nullish(),
    country: z.string().trim().max(2).nullish(),
    sector: z.string().trim().max(120).nullish(),
    supplierId: idSchema.nullish(),
    factorSourceId: idSchema.nullish(),
    gasTypes: z.array(z.string().trim().min(1).max(30)).optional(),
    businessUnitId: idSchema.nullish(),
    facilityId: idSchema.nullish(),
    buildingId: idSchema.nullish(),
    productionLineId: idSchema.nullish(),
    equipmentId: idSchema.nullish(),
    emissionSourceId: idSchema.nullish(),
    mobileMethod: z.enum(["FUEL", "DISTANCE"]).optional(),
    process: z
      .object({
        purity: z.number().min(0).max(1).optional(),
        calcinationFraction: z.number().min(0).max(1).optional(),
      })
      .optional(),
    fugitive: z
      .object({
        method: z.enum(["SCREENING", "MATERIAL_BALANCE"]),
        gas: z.string().trim().max(30).optional(),
        blend: z.string().trim().max(30).optional(),
        inventoryChange: finiteNumber,
        purchases: finiteNumber,
        disposals: finiteNumber,
        capacityChange: finiteNumber.optional(),
      })
      .optional(),
    biogenicFraction: z.number().min(0).max(1).optional(),
    measurementType: measurementTypeSchema.optional(),
    isEstimated: z.boolean().optional(),
    hasEvidence: z.boolean().optional(),
    activityDataUncertainty: z.number().min(0).max(200).optional(),
    methodologyUncertainty: z.number().min(0).max(200).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.scope === "SCOPE_1" && !value.scope1SourceType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scope1SourceType"],
        message: "A Scope 1 entry must declare a scope1SourceType",
      });
    }
    if (value.scope1SourceType === "FUGITIVE" && !value.fugitive) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fugitive"],
        message: "A fugitive entry must carry a refrigerant balance",
      });
    }
    if (value.scope === "SCOPE_3" && !value.scope3Category) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scope3Category"],
        message: "A Scope 3 entry must declare a scope3Category",
      });
    }
  });
export type CalculationEntryInput = z.infer<typeof calculationEntrySchema>;

/** `EmissionAllocation` — splitting a calculated total across target entities. */
export const emissionAllocationInputSchema = z
  .object({
    calculationId: idSchema,
    resultId: idSchema.nullish(),
    allocationMethod: z.enum(["physical", "economic", "mass", "energy-content"]),
    keys: z
      .array(
        z.object({
          targetEntity: z.string().trim().min(1).max(60),
          targetEntityId: idSchema,
          weight: nonNegativeNumber,
        }),
      )
      .min(1),
    unit: z.string().trim().min(1).max(20).default("tCO2e"),
  })
  .refine((value) => value.keys.some((key) => key.weight > 0), {
    message: "At least one allocation key must have a positive weight",
    path: ["keys"],
  });
export type EmissionAllocationInput = z.infer<typeof emissionAllocationInputSchema>;

export const emissionInventoryInputSchema = z.object({
  organizationId: idSchema,
  name: nameSchema,
  reportingYear: yearSchema,
  baselineYear: yearSchema.nullish(),
  scope1Total: nonNegativeNumber.default(0),
  scope2Location: nonNegativeNumber.default(0),
  scope2Market: nonNegativeNumber.default(0),
  scope3Total: nonNegativeNumber.default(0),
  totalEmissions: nonNegativeNumber.default(0),
  unit: z.string().trim().min(1).max(20).default("tCO2e"),
  status: z.enum(["draft", "calculated", "verified", "published"]).default("draft"),
});
export type EmissionInventoryInput = z.infer<typeof emissionInventoryInputSchema>;

export const calculationMethodologyInputSchema = z.object({
  name: nameSchema,
  version: z.string().trim().min(1).max(40),
  framework: z.string().trim().min(1).max(80),
  description: descriptionSchema.nullish(),
  formula: z.string().trim().max(500).nullish(),
  sourceUrl: z.string().trim().url().max(500).nullish(),
  isDefault: z.boolean().default(false),
});
export type CalculationMethodologyInput = z.infer<typeof calculationMethodologyInputSchema>;

export const calculationQuerySchema = z.object({
  organizationId: idSchema,
  reportingYear: z.coerce.number().int().min(1900).max(2100).optional(),
  scope: ghgScopeSchema.optional(),
  status: z.string().trim().max(40).optional(),
  dataQuality: dataQualityLevelSchema.optional(),
  calculatedAfter: dateSchema.optional(),
});
export type CalculationQuery = z.infer<typeof calculationQuerySchema>;
