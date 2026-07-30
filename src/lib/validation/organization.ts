/**
 * Validation schemas for the 7-level organization hierarchy.
 *
 * Each level carries the parent reference its Prisma model requires: a
 * `BusinessUnit` needs an organization, a `Building` needs a facility, and an
 * `EmissionSource` may attach at any of the four lowest levels but must attach
 * to at least one — that last rule is not expressible as a column constraint,
 * so it lives here.
 */

import { z } from "zod";

import {
  calculationApproachSchema,
  codeSchema,
  countrySchema,
  currencySchema,
  descriptionSchema,
  fractionSchema,
  ghgScopeSchema,
  idSchema,
  monthSchema,
  nameSchema,
  nonNegativeNumber,
  organizationTierSchema,
  registryUnitSchema,
  scope3CategorySchema,
  urlSchema,
  yearSchema,
} from "./common";

export const organizationInputSchema = z.object({
  name: nameSchema,
  legalName: nameSchema.nullish(),
  industry: z.string().trim().max(120).nullish(),
  sector: z.string().trim().max(120).nullish(),
  country: countrySchema.nullish(),
  region: z.string().trim().max(120).nullish(),
  address: z.string().trim().max(500).nullish(),
  website: urlSchema.nullish(),
  logoUrl: urlSchema.nullish(),
  registrationNum: z.string().trim().max(60).nullish(),
  fiscalYearStart: monthSchema.default(1),
  baseCurrency: currencySchema.default("USD"),
  reportingYear: yearSchema.nullish(),
  isActive: z.boolean().default(true),
});
export type OrganizationInput = z.infer<typeof organizationInputSchema>;

export const businessUnitInputSchema = z.object({
  organizationId: idSchema,
  name: nameSchema,
  code: codeSchema.nullish(),
  description: descriptionSchema.nullish(),
  tier: organizationTierSchema.default("BUSINESS_UNIT"),
  isActive: z.boolean().default(true),
});
export type BusinessUnitInput = z.infer<typeof businessUnitInputSchema>;

export const facilityInputSchema = z
  .object({
    organizationId: idSchema,
    businessUnitId: idSchema.nullish(),
    name: nameSchema,
    code: codeSchema.nullish(),
    type: z.string().trim().max(80).nullish(),
    address: z.string().trim().max(500).nullish(),
    city: z.string().trim().max(120).nullish(),
    state: z.string().trim().max(120).nullish(),
    country: countrySchema.nullish(),
    latitude: z.number().min(-90).max(90).nullish(),
    longitude: z.number().min(-180).max(180).nullish(),
    area: nonNegativeNumber.nullish(),
    areaUnit: registryUnitSchema.default("sqm"),
    operationalControl: z.boolean().default(true),
    /** Stored as a percentage by `Facility.equityShare`. */
    equityShare: z.number().min(0).max(100).default(100),
    isActive: z.boolean().default(true),
  })
  .refine(
    (value) =>
      (value.latitude === null || value.latitude === undefined) ===
      (value.longitude === null || value.longitude === undefined),
    { message: "latitude and longitude must be supplied together", path: ["longitude"] },
  );
export type FacilityInput = z.infer<typeof facilityInputSchema>;

export const buildingInputSchema = z.object({
  facilityId: idSchema,
  name: nameSchema,
  code: codeSchema.nullish(),
  type: z.string().trim().max(80).nullish(),
  floors: z.number().int().min(1).max(300).nullish(),
  area: nonNegativeNumber.nullish(),
  areaUnit: registryUnitSchema.default("sqm"),
  yearBuilt: yearSchema.nullish(),
  energyRating: z.string().trim().max(40).nullish(),
  isActive: z.boolean().default(true),
});
export type BuildingInput = z.infer<typeof buildingInputSchema>;

export const productionLineInputSchema = z.object({
  buildingId: idSchema,
  name: nameSchema,
  code: codeSchema.nullish(),
  type: z.string().trim().max(80).nullish(),
  capacity: nonNegativeNumber.nullish(),
  capacityUnit: z.string().trim().max(30).nullish(),
  isActive: z.boolean().default(true),
});
export type ProductionLineInput = z.infer<typeof productionLineInputSchema>;

export const equipmentInputSchema = z.object({
  productionLineId: idSchema,
  name: nameSchema,
  code: codeSchema.nullish(),
  type: z.string().trim().max(80).nullish(),
  manufacturer: z.string().trim().max(120).nullish(),
  model: z.string().trim().max(120).nullish(),
  serialNumber: z.string().trim().max(120).nullish(),
  installDate: z.coerce.date().nullish(),
  /** Thermal or conversion efficiency as a 0..1 fraction. */
  efficiency: fractionSchema.nullish(),
  fuelTypeId: idSchema.nullish(),
  refrigerantId: idSchema.nullish(),
  isActive: z.boolean().default(true),
});
export type EquipmentInput = z.infer<typeof equipmentInputSchema>;

const EMISSION_SOURCE_PARENTS = [
  "facilityId",
  "buildingId",
  "productionLineId",
  "equipmentId",
] as const;

export const emissionSourceInputSchema = z
  .object({
    name: nameSchema,
    code: codeSchema.nullish(),
    scope: ghgScopeSchema,
    scope3Category: scope3CategorySchema.nullish(),
    sourceType: z.string().trim().max(80).nullish(),
    description: descriptionSchema.nullish(),
    calculationApproach: calculationApproachSchema.default("ACTIVITY_BASED"),
    facilityId: idSchema.nullish(),
    buildingId: idSchema.nullish(),
    productionLineId: idSchema.nullish(),
    equipmentId: idSchema.nullish(),
    isActive: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    const attached = EMISSION_SOURCE_PARENTS.some((key) => {
      const parent = value[key];
      return parent !== null && parent !== undefined;
    });
    if (!attached) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["facilityId"],
        message:
          "An emission source must attach to a facility, building, production line or equipment",
      });
    }
    if (value.scope === "SCOPE_3" && !value.scope3Category) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scope3Category"],
        message: "A Scope 3 source must declare a scope3Category",
      });
    }
    if (value.scope !== "SCOPE_3" && value.scope3Category) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scope3Category"],
        message: "scope3Category is only valid on a Scope 3 source",
      });
    }
  });
export type EmissionSourceInput = z.infer<typeof emissionSourceInputSchema>;
