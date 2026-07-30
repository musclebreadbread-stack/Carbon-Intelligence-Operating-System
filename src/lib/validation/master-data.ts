/**
 * Validation schemas for the master-data catalogues that activity entries
 * reference: products, raw materials, fuels, vehicles, refrigerants, suppliers,
 * logistics routes, energy sources, waste types and water sources.
 */

import { z } from "zod";

import {
  codeSchema,
  countrySchema,
  descriptionSchema,
  emailSchema,
  energyTypeSchema,
  fractionSchema,
  fuelCategorySchema,
  idSchema,
  nameSchema,
  nonNegativeNumber,
  percentSchema,
  positiveNumber,
  registryUnitSchema,
  vehicleTypeSchema,
  yearSchema,
} from "./common";

export const productInputSchema = z.object({
  organizationId: idSchema,
  name: nameSchema,
  sku: z.string().trim().max(80).nullish(),
  category: z.string().trim().max(120).nullish(),
  description: descriptionSchema.nullish(),
  unit: registryUnitSchema.nullish(),
  weight: nonNegativeNumber.nullish(),
  weightUnit: registryUnitSchema.nullish(),
  lifecycleStage: z.string().trim().max(80).nullish(),
  isActive: z.boolean().default(true),
});
export type ProductInput = z.infer<typeof productInputSchema>;

export const rawMaterialInputSchema = z
  .object({
    name: nameSchema,
    category: z.string().trim().max(120).nullish(),
    unit: registryUnitSchema.nullish(),
    /** kgCO2e per `unit`. */
    emissionIntensity: nonNegativeNumber.nullish(),
    sourceRegion: z.string().trim().max(120).nullish(),
    isRecycled: z.boolean().default(false),
    recycledContent: percentSchema.default(0),
  })
  .refine((value) => value.isRecycled || value.recycledContent === 0, {
    message: "recycledContent must be 0 when isRecycled is false",
    path: ["recycledContent"],
  });
export type RawMaterialInput = z.infer<typeof rawMaterialInputSchema>;

export const fuelTypeInputSchema = z.object({
  name: nameSchema,
  category: fuelCategorySchema,
  description: descriptionSchema.nullish(),
});
export type FuelTypeInput = z.infer<typeof fuelTypeInputSchema>;

export const fuelInputSchema = z
  .object({
    name: nameSchema,
    fuelTypeId: idSchema,
    unit: registryUnitSchema,
    /** Net (lower) calorific value, MJ per `unit`. */
    netCalorific: positiveNumber.nullish(),
    /** Gross (higher) calorific value, MJ per `unit`. */
    grossCalorific: positiveNumber.nullish(),
    /** kg per litre for liquids, kg per m3 for gases. */
    density: positiveNumber.nullish(),
    /** Mass fraction of carbon, 0..1. */
    carbonContent: fractionSchema.nullish(),
    isRenewable: z.boolean().default(false),
  })
  .refine(
    (value) =>
      value.netCalorific === null ||
      value.netCalorific === undefined ||
      value.grossCalorific === null ||
      value.grossCalorific === undefined ||
      value.grossCalorific >= value.netCalorific,
    {
      message: "grossCalorific must be at least netCalorific",
      path: ["grossCalorific"],
    },
  );
export type FuelInput = z.infer<typeof fuelInputSchema>;

export const vehicleInputSchema = z.object({
  name: nameSchema,
  type: vehicleTypeSchema,
  fuelType: z.string().trim().max(80).nullish(),
  make: z.string().trim().max(80).nullish(),
  model: z.string().trim().max(80).nullish(),
  year: yearSchema.nullish(),
  efficiency: positiveNumber.nullish(),
  efficiencyUnit: z.string().trim().max(30).nullish(),
  isOwned: z.boolean().default(true),
});
export type VehicleInput = z.infer<typeof vehicleInputSchema>;

export const refrigerantInputSchema = z.object({
  name: nameSchema,
  chemicalFormula: z.string().trim().max(80).nullish(),
  gwp100: positiveNumber,
  gwp20: positiveNumber.nullish(),
  ozoneDepletionPotential: nonNegativeNumber.nullish(),
  category: z.string().trim().max(40).nullish(),
});
export type RefrigerantInput = z.infer<typeof refrigerantInputSchema>;

export const supplierInputSchema = z.object({
  organizationId: idSchema,
  name: nameSchema,
  code: codeSchema.nullish(),
  category: z.string().trim().max(120).nullish(),
  country: countrySchema.nullish(),
  contactEmail: emailSchema.nullish(),
  /** Value-chain tier; 1 is a direct supplier. */
  tier: z.number().int().min(1).max(10).default(1),
  sustainabilityRating: z.string().trim().max(20).nullish(),
  isActive: z.boolean().default(true),
});
export type SupplierInput = z.infer<typeof supplierInputSchema>;

export const logisticsRouteInputSchema = z.object({
  name: nameSchema,
  origin: z.string().trim().min(1).max(200),
  destination: z.string().trim().min(1).max(200),
  distance: positiveNumber,
  distanceUnit: registryUnitSchema.default("km"),
  transportMode: z.string().trim().min(1).max(60),
  isReturn: z.boolean().default(false),
});
export type LogisticsRouteInput = z.infer<typeof logisticsRouteInputSchema>;

export const energySourceInputSchema = z.object({
  name: nameSchema,
  type: energyTypeSchema,
  provider: z.string().trim().max(120).nullish(),
  gridRegion: z.string().trim().max(120).nullish(),
  renewablePercent: percentSchema.default(0),
  contractType: z.string().trim().max(60).nullish(),
});
export type EnergySourceInput = z.infer<typeof energySourceInputSchema>;

export const wasteTypeInputSchema = z.object({
  name: nameSchema,
  category: z.string().trim().max(120).nullish(),
  disposalMethod: z.string().trim().max(60).nullish(),
  isHazardous: z.boolean().default(false),
  recyclingRate: percentSchema.default(0),
});
export type WasteTypeInput = z.infer<typeof wasteTypeInputSchema>;

export const waterSourceInputSchema = z.object({
  name: nameSchema,
  type: z.string().trim().max(60).nullish(),
  source: z.string().trim().max(120).nullish(),
  treatment: z.string().trim().max(120).nullish(),
  isRecycled: z.boolean().default(false),
});
export type WaterSourceInput = z.infer<typeof waterSourceInputSchema>;
