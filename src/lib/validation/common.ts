/**
 * Shared zod fragments used by every validation module.
 *
 * zod v3 classic API via the bare `zod` import (decision 9) — never `zod/v4`.
 *
 * Every enum schema is built from the `const` tuples in `src/lib/core/enums.ts`
 * rather than re-listing members, so a Prisma enum change is a single-file edit
 * and can never drift out of sync with the validation layer.
 */

import { z } from "zod";

import {
  AGENT_STATUSES,
  AI_MODEL_TYPES,
  CALCULATION_APPROACHES,
  CREDIT_STATUSES,
  DATA_QUALITY_LEVELS,
  DATA_SOURCE_TYPES,
  DISCLOSURE_STATUSES,
  EMISSION_FACTOR_UNITS,
  ENERGY_TYPES,
  FUEL_CATEGORIES,
  GHG_SCOPES,
  GWP_VERSIONS,
  IMPORT_STATUSES,
  MEASUREMENT_FREQUENCIES,
  NOTIFICATION_TYPES,
  ORGANIZATION_TIERS,
  REPORTING_FRAMEWORKS,
  RULE_OPERATORS,
  SCENARIO_TYPES,
  SCOPE3_CATEGORIES,
  TARGET_BOUNDARIES,
  TARGET_STATUSES,
  VEHICLE_TYPES,
  VERIFICATION_STATUSES,
} from "@/lib/core/enums";
import { findUnit, normalizeUnit } from "@/lib/reference/units";

// ---------------------------------------------------------------------------
// Enum schemas
// ---------------------------------------------------------------------------

export const ghgScopeSchema = z.enum(GHG_SCOPES);
export const scope3CategorySchema = z.enum(SCOPE3_CATEGORIES);
export const organizationTierSchema = z.enum(ORGANIZATION_TIERS);
export const dataQualityLevelSchema = z.enum(DATA_QUALITY_LEVELS);
export const calculationApproachSchema = z.enum(CALCULATION_APPROACHES);
export const reportingFrameworkSchema = z.enum(REPORTING_FRAMEWORKS);
export const emissionFactorUnitSchema = z.enum(EMISSION_FACTOR_UNITS);
export const ruleOperatorSchema = z.enum(RULE_OPERATORS);
export const measurementFrequencySchema = z.enum(MEASUREMENT_FREQUENCIES);
export const verificationStatusSchema = z.enum(VERIFICATION_STATUSES);
export const gwpVersionSchema = z.enum(GWP_VERSIONS);
export const targetStatusSchema = z.enum(TARGET_STATUSES);
export const targetBoundarySchema = z.enum(TARGET_BOUNDARIES);
export const scenarioTypeSchema = z.enum(SCENARIO_TYPES);
export const creditStatusSchema = z.enum(CREDIT_STATUSES);
export const disclosureStatusSchema = z.enum(DISCLOSURE_STATUSES);
export const agentStatusSchema = z.enum(AGENT_STATUSES);
export const aiModelTypeSchema = z.enum(AI_MODEL_TYPES);
export const dataSourceTypeSchema = z.enum(DATA_SOURCE_TYPES);
export const fuelCategorySchema = z.enum(FUEL_CATEGORIES);
export const vehicleTypeSchema = z.enum(VEHICLE_TYPES);
export const energyTypeSchema = z.enum(ENERGY_TYPES);
export const importStatusSchema = z.enum(IMPORT_STATUSES);
export const notificationTypeSchema = z.enum(NOTIFICATION_TYPES);

/** Not a Prisma enum — the consolidation approach the aggregation engine takes. */
export const consolidationApproachSchema = z.enum([
  "OPERATIONAL_CONTROL",
  "FINANCIAL_CONTROL",
  "EQUITY_SHARE",
]);

export const scope2BasisSchema = z.enum(["LOCATION", "MARKET"]);

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/**
 * Database identifier. Prisma issues cuids, but the seed and the demo fixtures
 * use readable slugs, so this is a non-empty bounded string rather than
 * `z.string().cuid()`.
 */
export const idSchema = z.string().trim().min(1, "Required").max(64);

export const optionalId = idSchema.nullish();

export const nameSchema = z.string().trim().min(1, "Required").max(200);

export const codeSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .regex(/^[A-Za-z0-9._-]+$/, "Use letters, digits, dot, dash or underscore only");

export const descriptionSchema = z.string().trim().max(2000);

/** ISO 3166-1 alpha-2, upper-cased. */
export const countrySchema = z
  .string()
  .trim()
  .length(2, "Use a 2-letter ISO country code")
  .transform((value) => value.toUpperCase());

export const currencySchema = z
  .string()
  .trim()
  .length(3, "Use a 3-letter ISO currency code")
  .transform((value) => value.toUpperCase());

export const yearSchema = z.number().int().min(1900).max(2100);

export const monthSchema = z.number().int().min(1).max(12);

export const percentSchema = z.number().min(0).max(100);

/** 0..1 share, as stored by `Facility.equityShare` / renewable share levers. */
export const fractionSchema = z.number().min(0).max(1);

export const positiveNumber = z.number().finite().positive();
export const nonNegativeNumber = z.number().finite().nonnegative();
export const finiteNumber = z.number().finite();

export const dateSchema = z.coerce.date();

export const urlSchema = z.string().trim().url().max(500);

export const emailSchema = z.string().trim().toLowerCase().email().max(320);

/**
 * A unit symbol that must exist in the item-4 unit registry. The parsed value is
 * normalised to the canonical spelling (`kwh` → `kWh`) so downstream conversion
 * never has to re-normalise.
 */
export const registryUnitSchema = z
  .string()
  .trim()
  .min(1, "Required")
  .superRefine((value, ctx) => {
    if (!findUnit(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unknown unit "${value}"; it is not in the unit registry`,
      });
    }
  })
  .transform((value) => normalizeUnit(value) as string);

// ---------------------------------------------------------------------------
// Composites
// ---------------------------------------------------------------------------

/** `startDate` / `endDate` pair with the ordering rule applied. */
export const dateRangeSchema = z
  .object({ startDate: dateSchema, endDate: dateSchema })
  .refine((value) => value.endDate.getTime() >= value.startDate.getTime(), {
    message: "endDate must be on or after startDate",
    path: ["endDate"],
  });

export const reportingPeriodSchema = z
  .object({ start: dateSchema, end: dateSchema })
  .refine((value) => value.end.getTime() >= value.start.getTime(), {
    message: "end must be on or after start",
    path: ["end"],
  });

/** Cursor-free page/limit pagination, shared by repositories and the REST API. */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type Pagination = z.infer<typeof paginationSchema>;

/** Flattens a `safeParse` failure into `{ field: [messages] }`. */
export function fieldErrors(error: z.ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_root";
    (result[key] ??= []).push(issue.message);
  }
  return result;
}
