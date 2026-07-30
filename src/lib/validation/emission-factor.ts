/**
 * Validation schemas for the emission-factor library.
 *
 * The rules the resolution engine depends on are enforced here:
 *   - `unit` must be an `EmissionFactorUnit` member, so the denominator unit is
 *     always resolvable through `FACTOR_DENOMINATOR_UNIT`
 *   - `validTo` must be strictly after `validFrom`, otherwise the validity
 *     window can never match and the factor is silently unreachable
 *   - a Scope 3 factor must name its category, and a non-Scope-3 factor must not
 */

import { z } from "zod";

import { EMISSION_FACTOR_UNITS } from "@/lib/core/enums";
import { FACTOR_DENOMINATOR_UNIT } from "@/lib/reference/units";

import {
  dataQualityLevelSchema,
  dateSchema,
  descriptionSchema,
  emissionFactorUnitSchema,
  fractionSchema,
  ghgScopeSchema,
  idSchema,
  nameSchema,
  nonNegativeNumber,
  registryUnitSchema,
  scope3CategorySchema,
  urlSchema,
} from "./common";

export const emissionFactorInputSchema = z
  .object({
    name: nameSchema,
    /**
     * kg of the named gas (or CO2e) per denominator unit. Non-negative rather
     * than positive: a zero factor is legitimate for a zero-carbon grid tariff.
     */
    value: nonNegativeNumber,
    unit: emissionFactorUnitSchema,
    gasType: z.string().trim().min(1).max(30).default("CO2e"),
    scope: ghgScopeSchema.nullish(),
    scope3Category: scope3CategorySchema.nullish(),
    region: z.string().trim().max(120).nullish(),
    country: z.string().trim().max(2).nullish(),
    sector: z.string().trim().max(120).nullish(),
    validFrom: dateSchema.nullish(),
    validTo: dateSchema.nullish(),
    isActive: z.boolean().default(true),
    /** Relative uncertainty as a 0..1 fraction, per IPCC good practice. */
    uncertainty: fractionSchema.nullish(),
    dataQuality: dataQualityLevelSchema.nullish(),
    organizationId: idSchema.nullish(),
    sourceId: idSchema.nullish(),
    categoryId: idSchema.nullish(),
    versionId: idSchema.nullish(),
  })
  .superRefine((value, ctx) => {
    if (
      value.validFrom !== null &&
      value.validFrom !== undefined &&
      value.validTo !== null &&
      value.validTo !== undefined &&
      value.validTo.getTime() <= value.validFrom.getTime()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["validTo"],
        message: "validTo must be after validFrom",
      });
    }
    if (value.scope === "SCOPE_3" && !value.scope3Category) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scope3Category"],
        message: "A Scope 3 factor must declare a scope3Category",
      });
    }
    if (value.scope && value.scope !== "SCOPE_3" && value.scope3Category) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scope3Category"],
        message: "scope3Category is only valid on a Scope 3 factor",
      });
    }
  });
export type EmissionFactorInput = z.infer<typeof emissionFactorInputSchema>;

export const emissionFactorSourceInputSchema = z.object({
  name: nameSchema,
  description: descriptionSchema.nullish(),
  /** Required for citability: every seeded factor must trace to a publisher. */
  publisher: z.string().trim().min(1).max(200),
  url: urlSchema,
  methodology: descriptionSchema.nullish(),
  lastUpdated: dateSchema.nullish(),
});
export type EmissionFactorSourceInput = z.infer<typeof emissionFactorSourceInputSchema>;

export const emissionFactorVersionInputSchema = z.object({
  sourceId: idSchema,
  version: z.string().trim().min(1).max(40),
  releaseDate: dateSchema.nullish(),
  description: descriptionSchema.nullish(),
  isLatest: z.boolean().default(false),
  changelog: descriptionSchema.nullish(),
});
export type EmissionFactorVersionInput = z.infer<typeof emissionFactorVersionInputSchema>;

export const emissionFactorCategoryInputSchema = z.object({
  name: nameSchema,
  parentId: idSchema.nullish(),
  description: descriptionSchema.nullish(),
  level: z.number().int().min(0).max(6).default(0),
});
export type EmissionFactorCategoryInput = z.infer<typeof emissionFactorCategoryInputSchema>;

/** Filter accepted by the factor repository and the REST list endpoint. */
export const emissionFactorQuerySchema = z.object({
  organizationId: idSchema.optional(),
  scope: ghgScopeSchema.optional(),
  scope3Category: scope3CategorySchema.optional(),
  region: z.string().trim().max(120).optional(),
  country: z.string().trim().max(2).optional(),
  sector: z.string().trim().max(120).optional(),
  unit: emissionFactorUnitSchema.optional(),
  gasType: z.string().trim().max(30).optional(),
  /** When set, only factors whose validity window covers this date are returned. */
  validOn: dateSchema.optional(),
  includeInactive: z.coerce.boolean().default(false),
});
export type EmissionFactorQuery = z.infer<typeof emissionFactorQuerySchema>;

/** Criteria accepted by `resolveFactor`. */
export const factorResolutionCriteriaSchema = z.object({
  date: dateSchema,
  scope: ghgScopeSchema,
  scope3Category: scope3CategorySchema.nullish(),
  region: z.string().trim().max(120).nullish(),
  country: z.string().trim().max(2).nullish(),
  sector: z.string().trim().max(120).nullish(),
  organizationId: idSchema.nullish(),
  supplierId: idSchema.nullish(),
  sourceId: idSchema.nullish(),
  unit: registryUnitSchema.nullish(),
  gasType: z.string().trim().max(30).nullish(),
});
export type FactorResolutionCriteria = z.infer<typeof factorResolutionCriteriaSchema>;

export const unitConversionInputSchema = z
  .object({
    fromUnit: registryUnitSchema,
    toUnit: registryUnitSchema,
    factor: z.number().finite().positive(),
    description: descriptionSchema.nullish(),
    category: z.string().trim().max(40).nullish(),
  })
  .refine((value) => value.fromUnit !== value.toUnit, {
    message: "fromUnit and toUnit must differ",
    path: ["toUnit"],
  });
export type UnitConversionInput = z.infer<typeof unitConversionInputSchema>;

/**
 * Every `EmissionFactorUnit` member has a registered denominator unit. Exported
 * so the validation test can assert the two tables stay aligned rather than
 * discovering the gap at calculation time.
 */
export const FACTOR_UNITS_WITH_DENOMINATOR = EMISSION_FACTOR_UNITS.filter(
  (unit) => FACTOR_DENOMINATOR_UNIT[unit] !== undefined,
);
